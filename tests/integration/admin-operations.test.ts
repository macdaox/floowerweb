import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Miniflare } from "miniflare";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as inquiryRoute from "../../src/pages/api/admin/inquiries/[id]";
import * as subscriberRoute from "../../src/pages/api/admin/subscribers/index";
import * as exportRoute from "../../src/pages/api/admin/subscribers/export";
import * as userRoute from "../../src/pages/api/admin/users/[id]";
import * as settingsRoute from "../../src/pages/api/admin/settings/index";
import { verifyPassword } from "../../src/features/auth/password";

const workspace = resolve(import.meta.dirname, "../..");
const initialTime = "2026-09-19T08:00:00.000Z";
type Role = "admin" | "editor" | "sales";

describe("admin operations", () => {
  let miniflare: Miniflare;
  let database: D1Database;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-19T09:00:00.000Z"));
    miniflare = new Miniflare({ modules: true, script: "export default { fetch() { return new Response('ok'); } }", d1Databases: ["DB"] });
    database = await miniflare.getD1Database("DB") as unknown as D1Database;
    for (const name of ["0001_initial.sql", "0002_schema_normalization.sql", "0003_rate_limits.sql", "0004_submission_idempotency.sql", "0005_submission_idempotency_ledger.sql", "0006_active_media_references.sql"]) {
      const source = await readFile(resolve(workspace, "migrations", name), "utf8");
      if (name === "0006_active_media_references.sql") await applyTriggerMigration(database, source);
      else await applyMigration(database, source);
    }
    await seedOperations(database);
  });

  afterEach(async () => {
    vi.useRealTimers();
    await miniflare.dispose();
  });

  it("filters inquiry summaries and returns the complete submission context", async () => {
    const response = await inquiryRoute.GET(context("GET", "sales", "list", "/api/admin/inquiries/list?type=product&status=new&assignee=sales-1&dateFrom=2026-09-19&dateTo=2026-09-19&market=France&product=Magnolia"));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      data: { items: [{ id: "inquiry-1", country: "France", productName: "Magnolia", assigneeDisplayName: "Sales User" }], total: 1 },
    });

    const detail = await inquiryRoute.GET(context("GET", "admin", "inquiry-1", "/api/admin/inquiries/inquiry-1"));
    expect(detail.status).toBe(200);
    await expect(detail.json()).resolves.toMatchObject({
      data: {
        id: "inquiry-1", name: "Buyer One", email: "buyer@example.test", phone: "+33 1", company: "Maison", country: "France",
        buyerType: "wholesale", message: "Need a catalog", sourceRoute: "/products/magnolia", interests: ["branches", "flowers"],
        product: { id: "product-1", name: "Magnolia", productCode: "ES-MAG" },
        assignee: { id: "sales-1", displayName: "Sales User" }, notes: [],
      },
    });
    expect((await inquiryRoute.GET(context("GET", "editor", "list", "/api/admin/inquiries/list"))).status).toBe(403);
    expect((await inquiryRoute.GET(context("GET", "sales", "list", "/api/admin/inquiries/list?dateTo=2026-99-99"))).status).toBe(422);
  });

  it("assigns inquiries, validates every transition edge, creates immutable notes, and audits mutations", async () => {
    const assigned = await mutateInquiry("sales", "inquiry-1", { action: "assign", assigneeUserId: "admin-1", updatedAt: initialTime });
    expect(assigned.status).toBe(200);
    const assignedBody = await data<{ updatedAt: string }>(assigned);

    expect((await mutateInquiry("sales", "inquiry-1", { action: "transition", status: "qualified", updatedAt: assignedBody.updatedAt })).status).toBe(422);
    const contacted = await mutateInquiry("sales", "inquiry-1", { action: "transition", status: "contacted", updatedAt: assignedBody.updatedAt });
    expect(contacted.status).toBe(200);
    const contactedBody = await data<{ updatedAt: string }>(contacted);
    const noted = await mutateInquiry("sales", "inquiry-1", { action: "note", note: "Called buyer", updatedAt: contactedBody.updatedAt });
    expect(noted.status).toBe(201);
    const notedBody = await data<{ updatedAt: string; note: { note: string; author: { id: string }; createdAt: string } }>(noted);
    expect(notedBody.note).toEqual({ note: "Called buyer", author: { id: "sales-1", displayName: "Sales User" }, createdAt: "2026-09-19T09:00:00.002Z" });

    expect((await mutateInquiry("sales", "inquiry-1", { action: "assign", assigneeUserId: "sales-1", updatedAt: contactedBody.updatedAt })).status).toBe(409);
    expect((await mutateInquiry("editor", "inquiry-1", { action: "note", note: "No", updatedAt: notedBody.updatedAt })).status).toBe(403);

    const notes = await database.prepare("SELECT note, author_user_id AS authorUserId, created_at AS createdAt FROM inquiry_notes WHERE inquiry_id = ?").bind("inquiry-1").all();
    expect(notes.results).toEqual([{ note: "Called buyer", authorUserId: "sales-1", createdAt: "2026-09-19T09:00:00.002Z" }]);
    const audit = await database.prepare("SELECT action FROM audit_logs WHERE entity_id = 'inquiry-1' ORDER BY rowid").all();
    expect(audit.results).toEqual([{ action: "assign" }, { action: "transition" }, { action: "note" }]);
  });

  it.each([
    ["new", "contacted", 200], ["new", "spam", 200], ["new", "qualified", 422], ["new", "closed", 422],
    ["contacted", "qualified", 200], ["contacted", "closed", 200], ["contacted", "spam", 200], ["contacted", "new", 422],
    ["qualified", "closed", 200], ["qualified", "contacted", 200], ["qualified", "spam", 422],
    ["closed", "contacted", 200], ["closed", "qualified", 422], ["spam", "contacted", 200], ["spam", "closed", 422],
  ] as const)("enforces inquiry transition %s -> %s", async (from, to, status) => {
    await database.prepare("UPDATE inquiries SET status = ?, updated_at = ? WHERE id = 'inquiry-1'").bind(from, initialTime).run();
    expect((await mutateInquiry("admin", "inquiry-1", { action: "transition", status: to, updatedAt: initialTime })).status).toBe(status);
  });

  it("filters subscribers and exports a UTF-8 formula-safe CSV only for sales-capable roles", async () => {
    const listed = await subscriberRoute.GET(context("GET", "sales", undefined, "/api/admin/subscribers?status=subscribed&source=%3DHYPERLINK&dateFrom=2026-09-18&dateTo=2026-09-19"));
    expect(listed.status).toBe(200);
    await expect(listed.json()).resolves.toMatchObject({ data: { items: [{ email: "=IMPORTXML(example)", source: "=HYPERLINK" }], total: 1 } });

    const exported = await exportRoute.GET(context("GET", "sales", undefined, "/api/admin/subscribers/export?status=subscribed"));
    expect(exported.status).toBe(200);
    expect(exported.headers.get("content-type")).toContain("text/csv");
    expect(exported.headers.get("content-disposition")).toContain("subscribers.csv");
    expect([...new Uint8Array(await exported.clone().arrayBuffer()).slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    const csv = await exported.text();
    expect(csv).toContain("'=IMPORTXML(example)");
    expect(csv).toContain("'=HYPERLINK");
    expect((await subscriberRoute.GET(context("GET", "editor", undefined, "/api/admin/subscribers"))).status).toBe(403);
    expect((await exportRoute.GET(context("GET", "editor", undefined, "/api/admin/subscribers/export"))).status).toBe(403);
    expect((await subscriberRoute.GET(context("GET", "sales", undefined, "/api/admin/subscribers?dateFrom=2026-02-30"))).status).toBe(422);
  });

  it("lets only admins activate users, change roles, and reset passwords with optimistic locking", async () => {
    const list = await userRoute.GET(context("GET", "admin", "list", "/api/admin/users/list?role=editor&active=true"));
    expect(list.status).toBe(200);
    await expect(list.json()).resolves.toMatchObject({ data: { items: expect.arrayContaining([expect.objectContaining({ id: "target-1", role: "editor", isActive: true })]), total: 2 } });

    expect((await mutateUser("editor", "target-1", { action: "update", role: "sales", updatedAt: initialTime })).status).toBe(403);
    await database.prepare("INSERT INTO sessions (id, token_digest, user_id, expires_at, created_at) VALUES ('deactivate-session', 'deactivate-digest', 'target-1', '2099-01-01', ?)").bind(initialTime).run();
    const changed = await mutateUser("admin", "target-1", { action: "update", role: "sales", isActive: false, updatedAt: initialTime });
    expect(changed.status).toBe(200);
    const changedBody = await data<{ updatedAt: string; role: string; isActive: boolean }>(changed);
    expect(changedBody).toMatchObject({ role: "sales", isActive: false });
    expect(await database.prepare("SELECT id FROM sessions WHERE id = 'deactivate-session'").first()).toBeNull();
    expect((await mutateUser("admin", "target-1", { action: "update", isActive: true, updatedAt: initialTime })).status).toBe(409);

    await database.prepare("INSERT INTO sessions (id, token_digest, user_id, expires_at, created_at) VALUES ('session-1', 'digest-1', 'target-1', '2099-01-01', ?)").bind(initialTime).run();
    const reset = await mutateUser("admin", "target-1", { action: "resetPassword", password: "new-password-123", updatedAt: changedBody.updatedAt });
    expect(reset.status).toBe(200);
    const row = await database.prepare("SELECT password_hash AS passwordHash FROM users WHERE id = 'target-1'").first<{ passwordHash: string }>();
    expect(await verifyPassword("new-password-123", row?.passwordHash ?? "")).toBe(true);
    expect(await database.prepare("SELECT id FROM sessions WHERE user_id = 'target-1'").first()).toBeNull();
    expect((await database.prepare("SELECT COUNT(*) AS total FROM audit_logs WHERE entity_id = 'target-1'").first<{ total: number }>())?.total).toBe(2);
  });

  it("preserves sessions when stale password-reset and deactivation compare-and-swap writes lose", async () => {
    await database.prepare("INSERT INTO sessions (id, token_digest, user_id, expires_at, created_at) VALUES ('preserved-session', 'preserved-digest', 'target-1', '2099-01-01', ?)").bind(initialTime).run();
    await database.prepare("UPDATE users SET updated_at = '2026-09-19T08:30:00.000Z' WHERE id = 'target-1'").run();

    const staleReset = await mutateUser("admin", "target-1", { action: "resetPassword", password: "stale-password-123", updatedAt: initialTime });
    expect(staleReset.status).toBe(409);
    expect(await database.prepare("SELECT id FROM sessions WHERE id = 'preserved-session'").first()).toEqual({ id: "preserved-session" });

    const staleDeactivate = await mutateUser("admin", "target-1", { action: "update", isActive: false, updatedAt: initialTime });
    expect(staleDeactivate.status).toBe(409);
    expect(await database.prepare("SELECT id FROM sessions WHERE id = 'preserved-session'").first()).toEqual({ id: "preserved-session" });
    expect((await database.prepare("SELECT COUNT(*) AS total FROM audit_logs WHERE entity_id = 'target-1'").first<{ total: number }>())?.total).toBe(0);
  });

  it("allows editing an inactive admin and atomically keeps one active admin under concurrent removals", async () => {
    await database.prepare("UPDATE users SET role = 'admin', is_active = 0 WHERE id = 'target-1'").run();
    const inactiveEdit = await mutateUser("admin", "target-1", { action: "update", role: "editor", updatedAt: initialTime });
    expect(inactiveEdit.status).toBe(200);

    await database.prepare("UPDATE users SET role = 'editor', is_active = 1 WHERE id = 'admin-1'").run();
    for (const id of ["admin-a", "admin-b"]) {
      await database.prepare(`INSERT INTO users (id, email, username, display_name, password_hash, role, is_active, created_at, updated_at)
        VALUES (?, ?, ?, ?, 'test-hash', 'admin', 1, ?, ?)`).bind(id, `${id}@everstem.test`, id, id, initialTime, initialTime).run();
    }

    const [removeB, removeA] = await Promise.all([
      mutateUserAs("admin-a", "admin-b", { action: "update", role: "editor", updatedAt: initialTime }),
      mutateUserAs("admin-b", "admin-a", { action: "update", isActive: false, updatedAt: initialTime }),
    ]);
    expect([removeA.status, removeB.status].sort()).toEqual([200, 422]);
    const rejected = removeA.status === 422 ? removeA : removeB;
    await expect(rejected.json()).resolves.toMatchObject({ error: { code: "last_admin" } });
    expect((await database.prepare("SELECT COUNT(*) AS total FROM users WHERE role = 'admin' AND is_active = 1").first<{ total: number }>())?.total).toBe(1);
  });

  it("lets only admins edit validated site settings and rejects stale writes", async () => {
    const current = await settingsRoute.GET(context("GET", "admin", undefined, "/api/admin/settings"));
    expect(current.status).toBe(200);
    const currentBody = await data<{ updatedAt: string }>(current);
    expect((await settingsRoute.PUT(context("PUT", "sales", undefined, "/api/admin/settings", { version: 1, updatedAt: currentBody.updatedAt, data: { companyName: "No" } }))).status).toBe(403);

    const updated = await settingsRoute.PUT(context("PUT", "admin", undefined, "/api/admin/settings", {
      version: 1, updatedAt: currentBody.updatedAt,
      data: { companyName: "EVERSTEM Studio", tagline: "Botanical objects", companyDescription: "Global supply", contactEmail: "sales@everstem.test", instagramUrl: "https://instagram.com/everstem", pinterestUrl: "", linkedinUrl: "https://linkedin.com/company/everstem", defaultSeoTitle: "EVERSTEM", defaultSeoDescription: "Artificial botanical objects." },
    }));
    expect(updated.status).toBe(200);
    await expect(updated.json()).resolves.toMatchObject({ data: { companyName: "EVERSTEM Studio", updatedByUserId: "admin-1" } });
    expect((await settingsRoute.PUT(context("PUT", "admin", undefined, "/api/admin/settings", { version: 1, updatedAt: currentBody.updatedAt, data: { companyName: "Stale" } }))).status).toBe(409);
    expect((await database.prepare("SELECT COUNT(*) AS total FROM audit_logs WHERE entity_type = 'settings' AND entity_id = 'site'").first<{ total: number }>())?.total).toBe(1);
  });

  function context(method: string, role: Role, id: string | undefined, url: string, payload?: unknown) {
    return {
      request: new Request(`https://everstem.test${url}`, { method, headers: payload ? { "content-type": "application/json", origin: "https://everstem.test" } : undefined, body: payload ? JSON.stringify(payload) : undefined }),
      params: id ? { id } : {},
      locals: { runtime: { env: { DB: database } }, auth: { id: `${role}-1`, email: `${role}@everstem.test`, displayName: `${role[0].toUpperCase()}${role.slice(1)} User`, role } },
      url: new URL(`https://everstem.test${url}`),
    } as never;
  }

  function mutateInquiry(role: Role, id: string, payload: unknown) {
    return inquiryRoute.POST(context("POST", role, id, `/api/admin/inquiries/${id}`, payload));
  }

  function mutateUser(role: Role, id: string, payload: unknown) {
    return userRoute.POST(context("POST", role, id, `/api/admin/users/${id}`, payload));
  }

  function mutateUserAs(actorId: string, id: string, payload: unknown) {
    const request = new Request(`https://everstem.test/api/admin/users/${id}`, { method: "POST", headers: { "content-type": "application/json", origin: "https://everstem.test" }, body: JSON.stringify(payload) });
    return userRoute.POST({ request, params: { id }, locals: { runtime: { env: { DB: database } }, auth: { id: actorId, email: `${actorId}@everstem.test`, displayName: actorId, role: "admin" } }, url: new URL(request.url) } as never);
  }
});

async function data<T>(response: Response): Promise<T> {
  return ((await response.json()) as { data: T }).data;
}

async function seedOperations(database: D1Database): Promise<void> {
  for (const role of ["admin", "editor", "sales"] as const) {
    await database.prepare(`INSERT INTO users (id, email, username, display_name, password_hash, role, is_active, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'test-hash', ?, 1, ?, ?)`).bind(`${role}-1`, `${role}@everstem.test`, role, `${role[0].toUpperCase()}${role.slice(1)} User`, role, initialTime, initialTime).run();
  }
  await database.prepare(`INSERT INTO users (id, email, username, display_name, password_hash, role, is_active, created_at, updated_at)
    VALUES ('target-1', 'target@everstem.test', 'target', 'Target User', 'old-hash', 'editor', 1, ?, ?)`).bind(initialTime, initialTime).run();
  await database.prepare("INSERT INTO categories (id, locale, name, slug, status, created_at, updated_at) VALUES ('category-1', 'en', 'Flowers', 'flowers', 'published', ?, ?)").bind(initialTime, initialTime).run();
  await database.prepare(`INSERT INTO products (id, locale, name, slug, product_code, specifications_json, category_id, status, created_at, updated_at)
    VALUES ('product-1', 'en', 'Magnolia', 'magnolia', 'ES-MAG', '{}', 'category-1', 'published', ?, ?)`).bind(initialTime, initialTime).run();
  await database.prepare(`INSERT INTO inquiries (id, inquiry_type, name, email, phone, company, country, buyer_type, message, product_id, source_route, assignee_user_id, status, created_at, updated_at)
    VALUES ('inquiry-1', 'product', 'Buyer One', 'buyer@example.test', '+33 1', 'Maison', 'France', 'wholesale', 'Need a catalog', 'product-1', '/products/magnolia', 'sales-1', 'new', ?, ?)`).bind(initialTime, initialTime).run();
  await database.batch([
    database.prepare("INSERT INTO inquiry_interests (inquiry_id, interest, created_at) VALUES ('inquiry-1', 'flowers', ?)").bind(initialTime),
    database.prepare("INSERT INTO inquiry_interests (inquiry_id, interest, created_at) VALUES ('inquiry-1', 'branches', ?)").bind(initialTime),
    database.prepare("INSERT INTO subscribers (id, email, source, status, subscribed_at, created_at, updated_at) VALUES ('subscriber-1', '=IMPORTXML(example)', '=HYPERLINK', 'subscribed', ?, ?, ?)").bind(initialTime, initialTime, initialTime),
    database.prepare("INSERT INTO subscribers (id, email, source, status, subscribed_at, unsubscribed_at, created_at, updated_at) VALUES ('subscriber-2', 'past@example.test', '/footer', 'unsubscribed', '2026-09-01T00:00:00.000Z', '2026-09-02T00:00:00.000Z', '2026-09-01T00:00:00.000Z', '2026-09-02T00:00:00.000Z')"),
    database.prepare(`INSERT INTO settings (id, company_name, tagline, company_description, contact_email, instagram_url, pinterest_url, linkedin_url, default_seo_title, default_seo_description, created_at, updated_at)
      VALUES ('site', 'EVERSTEM', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ?, ?)`).bind(initialTime, initialTime),
  ]);
}

async function applyMigration(database: D1Database, source: string): Promise<void> {
  for (const statement of source.split(";").map((entry) => entry.trim()).filter(Boolean)) await database.prepare(statement).run();
}

async function applyTriggerMigration(database: D1Database, source: string): Promise<void> {
  for (const match of source.matchAll(/CREATE TRIGGER[\s\S]*?END;/gu)) await database.prepare(match[0].slice(0, -1)).run();
}
