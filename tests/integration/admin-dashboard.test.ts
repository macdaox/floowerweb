import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Miniflare } from "miniflare";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as dashboard } from "../../src/pages/api/admin/dashboard";

const workspace = resolve(import.meta.dirname, "../..");

describe("admin dashboard API", () => {
  let miniflare: Miniflare;
  let database: D1Database;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-14T12:00:00.000Z"));
    miniflare = new Miniflare({ modules: true, script: "export default { fetch() { return new Response('ok'); } }", d1Databases: ["DB"] });
    database = await miniflare.getD1Database("DB") as unknown as D1Database;
    for (const name of ["0001_initial.sql", "0002_schema_normalization.sql", "0003_rate_limits.sql", "0004_submission_idempotency.sql", "0005_submission_idempotency_ledger.sql"]) {
      await applyMigration(database, await readFile(resolve(workspace, "migrations", name), "utf8"));
    }
    await seedDashboardRecords(database);
  });

  afterEach(async () => {
    vi.useRealTimers();
    await miniflare.dispose();
  });

  it("returns ordered sales counts and recent inquiries only to sales-capable roles", async () => {
    const response = await dashboard({ locals: locals("admin") } as never);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      data: {
        kind: "sales",
        metrics: { newInquiries: 2, recentSevenDays: 2, activeSubscribers: 1, publishedProducts: 1 },
        recentInquiries: [
          { id: "inquiry-new", name: "Newest buyer", email: "newest@example.test", company: "Newest Co", status: "new", inquiryType: "catalog", createdAt: "2026-09-14T10:00:00.000Z" },
          { id: "inquiry-contacted", name: "Older buyer", email: "older@example.test", company: null, status: "contacted", inquiryType: "contact", createdAt: "2026-09-08T12:00:00.000Z" },
          { id: "inquiry-old", name: "Old buyer", email: "old@example.test", company: null, status: "new", inquiryType: "product", createdAt: "2026-09-06T12:00:00.000Z" },
        ],
      },
    });

    const salesResponse = await dashboard({ locals: locals("sales") } as never);
    expect((await salesResponse.json() as { data: { kind: string } }).data.kind).toBe("sales");
  });

  it("returns content-only metrics for editors without serializing inquiry PII", async () => {
    const response = await dashboard({ locals: locals("editor") } as never);
    const body = await response.json() as { ok: boolean; data: Record<string, unknown> };

    expect(body).toEqual({
      ok: true,
      data: { kind: "content", metrics: { draftProducts: 1, publishedProducts: 1, draftSpaces: 1, draftArticles: 1 } },
    });
    expect(JSON.stringify(body)).not.toContain("newest@example.test");
    expect(JSON.stringify(body)).not.toContain("Newest buyer");
    expect(JSON.stringify(body)).not.toContain("recentInquiries");
  });

  it("keeps missing and unsupported users in JSON 401 and 403 semantics", async () => {
    const anonymous = await dashboard({ locals: { runtime: { env: { DB: database } } } } as never);
    const unsupportedLocals = locals("admin");
    const unsupported = await dashboard({ locals: { ...unsupportedLocals, auth: { ...unsupportedLocals.auth, role: "viewer" } } } as never);

    expect(anonymous.status).toBe(401);
    await expect(anonymous.json()).resolves.toMatchObject({ ok: false, error: { code: "unauthorized" } });
    expect(unsupported.status).toBe(403);
    await expect(unsupported.json()).resolves.toMatchObject({ ok: false, error: { code: "forbidden" } });
  });

  function locals(role: "admin" | "editor" | "sales") {
    return { runtime: { env: { DB: database } }, auth: { id: `${role}-1`, email: `${role}@everstem.test`, displayName: role, role } };
  }
});

async function seedDashboardRecords(database: D1Database): Promise<void> {
  const createdAt = "2026-09-01T00:00:00.000Z";
  await database.prepare(`INSERT INTO categories (id, locale, name, slug, sort_order, status, created_at, updated_at)
    VALUES ('category', 'en', 'Flowers', 'flowers', 0, 'published', ?, ?)`).bind(createdAt, createdAt).run();
  await database.batch([
    database.prepare(`INSERT INTO products (id, locale, name, slug, product_code, specifications_json, category_id, status, created_at, updated_at)
      VALUES (?, 'en', ?, ?, ?, '{}', 'category', ?, ?, ?)`)
      .bind("published-product", "Published", "published", "ES-PUBLISHED", "published", createdAt, createdAt),
    database.prepare(`INSERT INTO products (id, locale, name, slug, product_code, specifications_json, category_id, status, created_at, updated_at)
      VALUES (?, 'en', ?, ?, ?, '{}', 'category', ?, ?, ?)`)
      .bind("draft-product", "Draft", "draft", "ES-DRAFT", "draft", createdAt, createdAt),
    database.prepare(`INSERT INTO spaces (id, locale, title, slug, category, status, created_at, updated_at)
      VALUES ('draft-space', 'en', 'Draft space', 'draft-space', 'Trade', 'draft', ?, ?)`).bind(createdAt, createdAt),
    database.prepare(`INSERT INTO articles (id, locale, title, slug, status, created_at, updated_at)
      VALUES ('draft-article', 'en', 'Draft article', 'draft-article', 'draft', ?, ?)`).bind(createdAt, createdAt),
    database.prepare(`INSERT INTO subscribers (id, email, source, status, subscribed_at, created_at, updated_at)
      VALUES ('subscriber', 'subscriber@example.test', '/', 'subscribed', ?, ?, ?)`).bind(createdAt, createdAt, createdAt),
    inquiry("inquiry-old", "product", "Old buyer", "old@example.test", null, "new", "2026-09-06T12:00:00.000Z"),
    inquiry("inquiry-contacted", "contact", "Older buyer", "older@example.test", null, "contacted", "2026-09-08T12:00:00.000Z"),
    inquiry("inquiry-new", "catalog", "Newest buyer", "newest@example.test", "Newest Co", "new", "2026-09-14T10:00:00.000Z"),
  ]);

  function inquiry(id: string, type: string, name: string, email: string, company: string | null, status: string, timestamp: string) {
    return database.prepare(`INSERT INTO inquiries (id, inquiry_type, name, email, company, source_route, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, '/test', ?, ?, ?)`).bind(id, type, name, email, company, status, timestamp, timestamp);
  }
}

async function applyMigration(database: D1Database, source: string): Promise<void> {
  for (const statement of source.split(";").map((entry) => entry.trim()).filter(Boolean)) await database.prepare(statement).run();
}
