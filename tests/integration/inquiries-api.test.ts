import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Miniflare } from "miniflare";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { POST as createInquiry } from "../../src/pages/api/inquiries";
import { POST as createSubscriber } from "../../src/pages/api/subscribers";

const workspace = resolve(import.meta.dirname, "../..");

describe("public inquiry and subscription APIs", () => {
  let miniflare: Miniflare;
  let database: D1Database;

  beforeEach(async () => {
    miniflare = new Miniflare({
      modules: true,
      script: "export default { fetch() { return new Response('ok'); } }",
      d1Databases: ["DB"],
    });
    database = await miniflare.getD1Database("DB") as unknown as D1Database;
    for (const name of ["0001_initial.sql", "0002_schema_normalization.sql", "0003_rate_limits.sql", "0004_submission_idempotency.sql", "0005_submission_idempotency_ledger.sql"]) {
      await applyMigration(database, await readFile(resolve(workspace, "migrations", name), "utf8"));
    }
    await database.prepare(`INSERT INTO categories (id, locale, name, slug, sort_order, status, created_at, updated_at)
      VALUES ('flowers', 'en', 'Flowers', 'flowers', 0, 'published', ?, ?)`)
      .bind(now(), now()).run();
    await database.prepare(`INSERT INTO products (id, locale, name, slug, product_code, specifications_json, category_id, status, created_at, updated_at)
      VALUES ('magnolia', 'en', 'Magnolia stem', 'magnolia-stem', 'ES-MAGNOLIA', '{}', 'flowers', 'published', ?, ?)`)
      .bind(now(), now()).run();
  });

  afterEach(async () => {
    await miniflare.dispose();
  });

  it("persists a normalized catalog inquiry with its source and product interest", async () => {
    const response = await createInquiry({
      request: jsonRequest("/api/inquiries", {
        inquiryType: "catalog",
        name: " Ada Lovelace ",
        email: " ADA@Example.COM ",
        company: "Analytical Engines",
        country: "United Kingdom",
        buyerType: "Retailer",
        interests: ["Artificial flowers"],
        message: "Please send the current catalog.",
        sourceRoute: "/wholesale",
        website: "",
      }),
      locals: locals(database),
    } as never);

    expect(response.status).toBe(201);
    const body = await response.json() as { ok: boolean; data: { id: string; status: string } };
    expect(body).toMatchObject({ ok: true, data: { status: "new" } });
    const inquiry = await database.prepare(`SELECT inquiry_type, name, email, company, country, buyer_type, message, source_route, status
      FROM inquiries WHERE id = ?`).bind(body.data.id).first<Record<string, string>>();
    expect(inquiry).toEqual({
      inquiry_type: "catalog", name: "Ada Lovelace", email: "ada@example.com", company: "Analytical Engines",
      country: "United Kingdom", buyer_type: "Retailer", message: "Please send the current catalog.", source_route: "/wholesale", status: "new",
    });
    expect((await database.prepare("SELECT interest FROM inquiry_interests WHERE inquiry_id = ?").bind(body.data.id).all<{ interest: string }>()).results)
      .toEqual([{ interest: "Artificial flowers" }]);
  });

  it("rejects malformed inquiry input with field errors", async () => {
    const response = await createInquiry({
      request: jsonRequest("/api/inquiries", { inquiryType: "catalog", name: "Ada", email: "bad", company: "A", country: "UK", sourceRoute: "/wholesale" }),
      locals: locals(database),
    } as never);

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({ ok: false, error: { code: "validation_failed", fields: { email: expect.any(String) } } });
    expect(await count("inquiries")).toBe(0);
  });

  it("quietly accepts honeypot submissions without persisting them", async () => {
    const response = await createInquiry({
      request: jsonRequest("/api/inquiries", { inquiryType: "contact", name: "Ada", email: "ada@example.com", sourceRoute: "/contact", website: "bot-filled" }),
      locals: locals(database),
    } as never);

    expect(response.status).toBe(204);
    expect(await count("inquiries")).toBe(0);
  });

  it("rejects a changed payload for a repeated inquiry idempotency key", async () => {
    const headers = { "idempotency-key": "a2c2b4ec-4f35-42d5-8804-111111111111" };
    const first = await createInquiry({ request: jsonRequest("/api/inquiries", productInquiry(), headers), locals: locals(database) } as never);
    const second = await createInquiry({ request: jsonRequest("/api/inquiries", { ...productInquiry(), message: "A replayed request" }, headers), locals: locals(database) } as never);

    expect(first.status).toBe(201);
    expect(second.status).toBe(409);
    expect(await count("inquiries")).toBe(1);
  });

  it("normalizes newsletter emails and makes a repeat subscription safe", async () => {
    const first = await createSubscriber({
      request: jsonRequest("/api/subscribers", { email: " NEWS@Example.COM ", source: "/footer" }),
      locals: locals(database),
    } as never);
    const second = await createSubscriber({
      request: jsonRequest("/api/subscribers", { email: "news@example.com", source: "/footer" }),
      locals: locals(database),
    } as never);

    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    await expect(first.json()).resolves.toEqual({ ok: true, data: { subscribed: true } });
    expect(await database.prepare("SELECT email, source, status FROM subscribers").first()).toEqual({ email: "news@example.com", source: "/footer", status: "subscribed" });
    expect(await count("subscribers")).toBe(1);
  });

  function count(table: "inquiries" | "subscribers"): Promise<number> {
    return database.prepare(`SELECT COUNT(*) AS count FROM ${table}`).first<{ count: number }>().then((row) => row?.count ?? 0);
  }
});

function productInquiry() {
  return { inquiryType: "product", name: "Ada", email: "ada@example.com", productId: "magnolia", sourceRoute: "/products/magnolia-stem", message: "I need project information." };
}

function locals(database: D1Database) {
  return { runtime: { env: { DB: database } } };
}

function jsonRequest(path: string, body: object, extraHeaders: Record<string, string> = {}): Request {
  return new Request(`https://everstem.test${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://everstem.test", "cf-connecting-ip": "198.51.100.10", ...extraHeaders },
    body: JSON.stringify(body),
  });
}

function now(): string {
  return "2026-09-13T00:00:00.000Z";
}

async function applyMigration(database: D1Database, source: string): Promise<void> {
  for (const statement of source.split(";").map((entry) => entry.trim()).filter(Boolean)) {
    await database.prepare(statement).run();
  }
}
