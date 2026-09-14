import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Miniflare } from "miniflare";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createInquiry as createInquiryService, inquiryPayloadHash } from "../../src/features/inquiries/service";
import { parseInquiryInput } from "../../src/features/inquiries/schemas";
import { POST as inquiries } from "../../src/pages/api/inquiries";
import { POST as subscribers } from "../../src/pages/api/subscribers";

const workspace = resolve(import.meta.dirname, "../..");
const idempotencyKey = "a2c2b4ec4f3542d58804111111111111";

describe("hardened public submission routes", () => {
  let miniflare: Miniflare;
  let database: D1Database;

  beforeEach(async () => {
    miniflare = new Miniflare({ modules: true, script: "export default { fetch() { return new Response('ok'); } }", d1Databases: ["DB"] });
    database = await miniflare.getD1Database("DB") as unknown as D1Database;
    for (const migration of ["0001_initial.sql", "0002_schema_normalization.sql", "0003_rate_limits.sql", "0004_submission_idempotency.sql", "0005_submission_idempotency_ledger.sql"]) {
      await applyMigration(database, await readFile(resolve(workspace, "migrations", migration), "utf8"));
    }
    await database.prepare(`INSERT INTO categories (id, locale, name, slug, sort_order, status, created_at, updated_at)
      VALUES ('flowers', 'en', 'Flowers', 'flowers', 0, 'published', ?, ?)`)
      .bind(now(), now()).run();
    await database.prepare(`INSERT INTO products (id, locale, name, slug, product_code, specifications_json, category_id, status, created_at, updated_at)
      VALUES ('magnolia', 'en', 'Magnolia stem', 'magnolia-stem', 'ES-MAGNOLIA', '{}', 'flowers', 'published', ?, ?)`)
      .bind(now(), now()).run();
  });

  afterEach(async () => { await miniflare.dispose(); });

  it("accepts native catalog form posts and redirects back with a success marker", async () => {
    const response = await inquiries({
      request: formRequest("/api/inquiries", {
        inquiry_type: "catalog", name: "Ada Lovelace", email: "ada@example.com", company: "Analytical Engines",
        country: "United Kingdom", buyer_type: "Retailer", product_interest: "Artificial flowers", source_route: "/wholesale", website: "",
      }),
      locals: locals(database),
    } as never);

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://everstem.test/wholesale?submitted=inquiry");
    expect(await count("inquiries")).toBe(1);
  });

  it("accepts native newsletter form posts and redirects back with a success marker", async () => {
    const response = await subscribers({
      request: formRequest("/api/subscribers", { email: "news@example.com", source: "/", website: "" }),
      locals: locals(database),
    } as never);

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://everstem.test/?submitted=subscriber#footer");
    expect(await count("subscribers")).toBe(1);
  });

  it("accepts multipart native inquiry posts", async () => {
    const response = await inquiries({
      request: multipartRequest("/api/inquiries", { inquiry_type: "contact", name: "Ada Lovelace", email: "ada@example.com", source_route: "/contact", website: "" }),
      locals: locals(database),
    } as never);

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://everstem.test/contact?submitted=inquiry");
    expect(await count("inquiries")).toBe(1);
  });

  it("returns useful HTML for native validation and rate-limit failures", async () => {
    const invalidInquiry = await inquiries({ request: formRequest("/api/inquiries", { inquiry_type: "contact", name: "A", email: "bad", source_route: "/contact", website: "" }), locals: locals(database) } as never);
    const invalidSubscriber = await subscribers({ request: formRequest("/api/subscribers", { email: "bad", source: "/", website: "" }), locals: locals(database) } as never);
    expect(invalidInquiry.status).toBe(422);
    expect(invalidSubscriber.status).toBe(422);
    expect(invalidInquiry.headers.get("content-type")).toContain("text/html");
    expect(invalidSubscriber.headers.get("content-type")).toContain("text/html");
    await expect(invalidInquiry.text()).resolves.toContain("We could not send your enquiry.");
    await expect(invalidSubscriber.text()).resolves.toContain("We could not subscribe you.");

    for (let index = 0; index < 5; index += 1) {
      const response = await inquiries({ request: formRequest("/api/inquiries", { inquiry_type: "contact", name: "Ada", email: `buyer-${index}@example.com`, source_route: "/contact", website: "" }), locals: locals(database) } as never);
      expect(response.status).toBe(303);
    }
    for (let index = 0; index < 10; index += 1) {
      const response = await subscribers({ request: formRequest("/api/subscribers", { email: `news-${index}@example.com`, source: "/", website: "" }), locals: locals(database) } as never);
      expect(response.status).toBe(303);
    }

    const limitedInquiry = await inquiries({ request: formRequest("/api/inquiries", { inquiry_type: "contact", name: "Ada", email: "limited@example.com", source_route: "/contact", website: "" }), locals: locals(database) } as never);
    const limitedSubscriber = await subscribers({ request: formRequest("/api/subscribers", { email: "limited@example.com", source: "/", website: "" }), locals: locals(database) } as never);
    expect(limitedInquiry.status).toBe(429);
    expect(limitedSubscriber.status).toBe(429);
    expect(limitedInquiry.headers.get("content-type")).toContain("text/html");
    expect(limitedSubscriber.headers.get("content-type")).toContain("text/html");
  });

  it("rejects cross-origin and oversized inquiry requests before persistence", async () => {
    const crossOrigin = await inquiries({ request: jsonRequest("/api/inquiries", productInquiry(), { origin: "https://evil.test" }), locals: locals(database) } as never);
    const oversized = await inquiries({ request: jsonRequest("/api/inquiries", { ...productInquiry(), message: "x".repeat(9_000) }), locals: locals(database) } as never);

    expect(crossOrigin.status).toBe(403);
    expect(oversized.status).toBe(413);
    expect(await count("inquiries")).toBe(0);
  });

  it("rejects cross-origin and oversized subscriber requests before persistence", async () => {
    const crossOrigin = await subscribers({ request: jsonRequest("/api/subscribers", { email: "news@example.com", source: "/" }, { origin: "https://evil.test" }), locals: locals(database) } as never);
    const oversized = await subscribers({ request: jsonRequest("/api/subscribers", { email: "news@example.com", source: "/", website: "x".repeat(3_000) }), locals: locals(database) } as never);

    expect(crossOrigin.status).toBe(403);
    expect(oversized.status).toBe(413);
    expect(await count("subscribers")).toBe(0);
  });

  it("rate limits distinct submissions but lets an exact replay bypass the quota", async () => {
    const first = await inquiries({ request: jsonRequest("/api/inquiries", productInquiry(), { "idempotency-key": idempotencyKey }), locals: locals(database) } as never);
    for (let index = 0; index < 6; index += 1) {
      const replay = await inquiries({ request: jsonRequest("/api/inquiries", productInquiry(), { "idempotency-key": idempotencyKey }), locals: locals(database) } as never);
      expect(replay.status).toBe(200);
    }
    let limited: Response | undefined;
    for (let index = 0; index < 4; index += 1) {
      limited = await inquiries({ request: jsonRequest("/api/inquiries", { ...productInquiry(), email: `buyer-${index}@example.com` }), locals: locals(database) } as never);
      expect(limited.status).toBe(201);
    }
    const overLimit = await inquiries({ request: jsonRequest("/api/inquiries", { ...productInquiry(), email: "over-limit@example.com" }), locals: locals(database) } as never);

    expect(first.status).toBe(201);
    expect(overLimit.status).toBe(429);
  });

  it("returns an idempotency conflict before rate limiting", async () => {
    const first = await inquiries({ request: jsonRequest("/api/inquiries", productInquiry(), { "idempotency-key": idempotencyKey }), locals: locals(database) } as never);
    expect(first.status).toBe(201);
    for (let index = 0; index < 4; index += 1) {
      const response = await inquiries({ request: jsonRequest("/api/inquiries", { ...productInquiry(), email: `buyer-${index}@example.com` }), locals: locals(database) } as never);
      expect(response.status).toBe(201);
    }

    const conflict = await inquiries({ request: jsonRequest("/api/inquiries", { ...productInquiry(), message: "Changed payload" }, { "idempotency-key": idempotencyKey }), locals: locals(database) } as never);
    expect(conflict.status).toBe(409);
  });

  it("keeps the original new-status response and rejects altered idempotent payloads", async () => {
    const first = await inquiries({ request: jsonRequest("/api/inquiries", productInquiry(), { "idempotency-key": idempotencyKey }), locals: locals(database) } as never);
    const id = (await first.json() as { data: { id: string } }).data.id;
    await database.prepare("UPDATE inquiries SET status = 'contacted' WHERE id = ?").bind(id).run();
    const replay = await inquiries({ request: jsonRequest("/api/inquiries", productInquiry(), { "idempotency-key": idempotencyKey }), locals: locals(database) } as never);
    const conflict = await inquiries({ request: jsonRequest("/api/inquiries", { ...productInquiry(), message: "Changed payload" }, { "idempotency-key": idempotencyKey }), locals: locals(database) } as never);

    await expect(replay.json()).resolves.toEqual({ ok: true, data: { id, status: "new" } });
    expect(conflict.status).toBe(409);
  });

  it("persists a related product, source route, and unique normalized interests atomically", async () => {
    const response = await inquiries({
      request: jsonRequest("/api/inquiries", { ...productInquiry(), interests: ["  Flowers ", "Flowers", "Branches"], sourceRoute: "/products/magnolia-stem" }),
      locals: locals(database),
    } as never);
    const id = (await response.json() as { data: { id: string } }).data.id;

    expect(await database.prepare("SELECT product_id, source_route FROM inquiries WHERE id = ?").bind(id).first()).toEqual({ product_id: "magnolia", source_route: "/products/magnolia-stem" });
    expect((await database.prepare("SELECT interest FROM inquiry_interests WHERE inquiry_id = ? ORDER BY interest").bind(id).all<{ interest: string }>()).results)
      .toEqual([{ interest: "Branches" }, { interest: "Flowers" }]);
  });

  it("rolls back the inquiry if its interest rows cannot be created", async () => {
    await database.exec(`CREATE TRIGGER reject_inquiry_interest BEFORE INSERT ON inquiry_interests BEGIN SELECT RAISE(ABORT, 'forced child failure'); END`);
    const input = parseInquiryInput({ ...productInquiry(), interests: ["Flowers"] });

    await expect(createInquiryService(database, input, { idempotencyKey, payloadHash: await inquiryPayloadHash(input) })).rejects.toThrow(/forced child failure/i);
    expect(await count("inquiries")).toBe(0);
    expect(await count("submission_idempotency_keys")).toBe(0);
  });

  it("quietly accepts both honeypots without persistence", async () => {
    const inquiry = await inquiries({ request: formRequest("/api/inquiries", { inquiry_type: "contact", name: "Bot", email: "bot@example.com", source_route: "/contact", website: "filled" }), locals: locals(database) } as never);
    const subscriber = await subscribers({ request: formRequest("/api/subscribers", { email: "bot@example.com", source: "/footer", website: "filled" }), locals: locals(database) } as never);

    expect(inquiry.status).toBe(204);
    expect(subscriber.status).toBe(204);
    expect(await count("inquiries")).toBe(0);
    expect(await count("subscribers")).toBe(0);
  });

  it("records subscriber idempotency on existing emails and conflicts when its payload changes", async () => {
    await subscribers({ request: jsonRequest("/api/subscribers", { email: "news@example.com", source: "/footer" }), locals: locals(database) } as never);
    const keyed = await subscribers({ request: jsonRequest("/api/subscribers", { email: "news@example.com", source: "/footer" }, { "idempotency-key": idempotencyKey }), locals: locals(database) } as never);
    const replay = await subscribers({ request: jsonRequest("/api/subscribers", { email: "news@example.com", source: "/footer" }, { "idempotency-key": idempotencyKey }), locals: locals(database) } as never);
    const conflict = await subscribers({ request: jsonRequest("/api/subscribers", { email: "news@example.com", source: "/contact" }, { "idempotency-key": idempotencyKey }), locals: locals(database) } as never);

    expect(keyed.status).toBe(200);
    expect(replay.status).toBe(200);
    expect(conflict.status).toBe(409);
  });

  it("replays a fresh keyed subscriber, rejects a cross-type key, and bypasses its rate limit", async () => {
    const fresh = await subscribers({ request: jsonRequest("/api/subscribers", { email: "fresh@example.com", source: "/" }, { "idempotency-key": idempotencyKey }), locals: locals(database) } as never);
    const replay = await subscribers({ request: jsonRequest("/api/subscribers", { email: "fresh@example.com", source: "/" }, { "idempotency-key": idempotencyKey }), locals: locals(database) } as never);
    expect(fresh.status).toBe(201);
    expect(replay.status).toBe(200);
    expect(await count("subscribers")).toBe(1);

    const crossType = await inquiries({ request: jsonRequest("/api/inquiries", productInquiry(), { "idempotency-key": idempotencyKey }), locals: locals(database) } as never);
    expect(crossType.status).toBe(409);

    for (let index = 0; index < 9; index += 1) {
      const response = await subscribers({ request: jsonRequest("/api/subscribers", { email: `quota-${index}@example.com`, source: "/" }), locals: locals(database) } as never);
      expect(response.status).toBe(201);
    }
    const quotaReplay = await subscribers({ request: jsonRequest("/api/subscribers", { email: "fresh@example.com", source: "/" }, { "idempotency-key": idempotencyKey }), locals: locals(database) } as never);
    const limited = await subscribers({ request: jsonRequest("/api/subscribers", { email: "over-quota@example.com", source: "/" }), locals: locals(database) } as never);
    expect(quotaReplay.status).toBe(200);
    expect(limited.status).toBe(429);
  });

  it("persists without invoking an outbound mail or network dependency", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (() => { throw new Error("outbound network call"); }) as typeof fetch;
    try {
      const response = await inquiries({ request: jsonRequest("/api/inquiries", productInquiry()), locals: locals(database) } as never);
      expect(response.status).toBe(201);
      const subscriber = await subscribers({ request: jsonRequest("/api/subscribers", { email: "news@example.com", source: "/" }), locals: locals(database) } as never);
      expect(subscriber.status).toBe(201);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  async function count(table: "inquiries" | "subscribers" | "submission_idempotency_keys"): Promise<number> {
    return (await database.prepare(`SELECT COUNT(*) AS count FROM ${table}`).first<{ count: number }>())?.count ?? 0;
  }
});

function productInquiry() {
  return { inquiryType: "product", name: "Ada", email: "ada@example.com", productId: "magnolia", sourceRoute: "/products/magnolia-stem", message: "I need project information.", website: "" };
}

function locals(database: D1Database) { return { runtime: { env: { DB: database } } }; }

function jsonRequest(path: string, body: object, headers: Record<string, string> = {}): Request {
  return new Request(`https://everstem.test${path}`, { method: "POST", headers: { "content-type": "application/json", origin: "https://everstem.test", "cf-connecting-ip": "198.51.100.90", ...headers }, body: JSON.stringify(body) });
}

function formRequest(path: string, fields: Record<string, string>): Request {
  return new Request(`https://everstem.test${path}`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", origin: "https://everstem.test", "cf-connecting-ip": "198.51.100.90", accept: "text/html" }, body: new URLSearchParams(fields) });
}

function multipartRequest(path: string, fields: Record<string, string>): Request {
  const body = new FormData();
  for (const [key, value] of Object.entries(fields)) body.set(key, value);
  return new Request(`https://everstem.test${path}`, { method: "POST", headers: { origin: "https://everstem.test", "cf-connecting-ip": "198.51.100.90", accept: "text/html" }, body });
}

function now() { return "2026-09-14T00:00:00.000Z"; }

async function applyMigration(database: D1Database, source: string): Promise<void> {
  for (const statement of source.split(";").map((entry) => entry.trim()).filter(Boolean)) await database.prepare(statement).run();
}
