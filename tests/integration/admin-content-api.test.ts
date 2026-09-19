import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Miniflare } from "miniflare";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as articleRoute from "../../src/pages/api/admin/articles/[id]";
import * as categoryRoute from "../../src/pages/api/admin/categories/[id]";
import * as pageRoute from "../../src/pages/api/admin/pages/[id]";
import * as productRoute from "../../src/pages/api/admin/products/[id]";
import * as spaceRoute from "../../src/pages/api/admin/spaces/[id]";
import { issuePreviewToken, verifyPreviewToken } from "../../src/features/admin-content/preview";

const workspace = resolve(import.meta.dirname, "../..");
const timestamp = "2026-09-14T12:00:00.000Z";
type Role = "admin" | "editor" | "sales";
type Route = typeof productRoute;

describe("admin content API", () => {
  let miniflare: Miniflare;
  let database: D1Database;

  beforeEach(async () => {
    miniflare = new Miniflare({ modules: true, script: "export default { fetch() { return new Response('ok'); } }", d1Databases: ["DB"] });
    database = await miniflare.getD1Database("DB") as unknown as D1Database;
    for (const name of ["0001_initial.sql", "0002_schema_normalization.sql", "0003_rate_limits.sql", "0004_submission_idempotency.sql", "0005_submission_idempotency_ledger.sql"]) {
      await applyMigration(database, await readFile(resolve(workspace, "migrations", name), "utf8"));
    }
    await seedActorsAndCategory(database);
  });

  afterEach(async () => { await miniflare.dispose(); });

  it("allows editors to create drafts, blocks sales, validates publish, and rejects stale updates", async () => {
    const created = await mutate(productRoute, "editor", "new", {
      version: 1,
      data: { name: "Draft stem", slug: "draft-stem", productCode: "ES-DRAFT", categoryId: "cat", specifications: { material: "Silk" } },
    });
    expect(created.status).toBe(201);
    const createdBody = await body<{ id: string; updatedAt: string }>(created);
    const id = createdBody.data.id;

    expect((await mutate(productRoute, "sales", id, { action: "publish" })).status).toBe(403);
    expect((await mutate(productRoute, "editor", id, { action: "preview", updatedAt: createdBody.data.updatedAt })).status).toBe(422);
    const incomplete = await mutate(productRoute, "editor", id, { version: 1, action: "publish", updatedAt: createdBody.data.updatedAt });
    expect(incomplete.status).toBe(422);
    await expect(incomplete.json()).resolves.toMatchObject({ error: { code: "publish_validation", fields: { summary: expect.any(String), body: expect.any(String) } } });

    const stale = await mutate(productRoute, "editor", id, { version: 1, updatedAt: "2000-01-01T00:00:00.000Z", data: { name: "Changed" } });
    expect(stale.status).toBe(409);

    const updated = await mutate(productRoute, "editor", id, {
      version: 1,
      updatedAt: createdBody.data.updatedAt,
      data: { summary: "A complete product summary.", body: "A complete public product body." },
    });
    expect(updated.status).toBe(200);
    const updatedBody = await body<{ updatedAt: string }>(updated);

    const preview = await mutate(productRoute, "editor", id, { version: 1, action: "preview", updatedAt: updatedBody.data.updatedAt });
    expect(preview.status).toBe(200);
    const previewBody = await body<{ token: string; url: string; expiresAt: string }>(preview);
    expect(previewBody.data.url).toMatch(/^\/products\/draft-stem\?preview=/);
    await expect(verifyPreviewToken(previewBody.data.token, "test-secret", "product", id)).resolves.toMatchObject({ kind: "product", id });

    const published = await mutate(productRoute, "editor", id, { version: 1, action: "publish", updatedAt: updatedBody.data.updatedAt });
    expect(published.status).toBe(200);
    const publishedBody = await body<{ status: string; updatedAt: string }>(published);
    expect(publishedBody.data.status).toBe("published");

    const unpublished = await mutate(productRoute, "admin", id, { version: 1, action: "unpublish", updatedAt: publishedBody.data.updatedAt });
    expect(unpublished.status).toBe(200);
    const unpublishedBody = await body<{ status: string; updatedAt: string }>(unpublished);
    expect(unpublishedBody.data.status).toBe("draft");

    const archived = await remove(productRoute, "editor", id, unpublishedBody.data.updatedAt);
    expect(archived.status).toBe(200);
    const archivedBody = await body<{ status: string; updatedAt: string }>(archived);
    expect(archivedBody.data.status).toBe("archived");
    expect((await mutate(productRoute, "editor", id, { version: 1, action: "publish", updatedAt: archivedBody.data.updatedAt })).status).toBe(422);
    expect((await mutate(productRoute, "editor", id, { version: 1, action: "preview", updatedAt: archivedBody.data.updatedAt })).status).toBe(422);

    const audit = await database.prepare("SELECT action, entity_type AS entityType, entity_id AS entityId FROM audit_logs WHERE entity_id = ? ORDER BY created_at, rowid").bind(id).all();
    expect(audit.results).toEqual([
      { action: "create", entityType: "product", entityId: id },
      { action: "update", entityType: "product", entityId: id },
      { action: "publish", entityType: "product", entityId: id },
      { action: "unpublish", entityType: "product", entityId: id },
      { action: "archive", entityType: "product", entityId: id },
    ]);
  });

  it("lists only English records with search, status/category filters, pagination, and allow-listed ordering", async () => {
    await create(productRoute, "editor", { name: "Zulu stem", slug: "zulu-stem", productCode: "ES-Z", categoryId: "cat", specifications: {} });
    await create(productRoute, "editor", { name: "Alpha stem", slug: "alpha-stem", productCode: "ES-A", categoryId: "cat", specifications: {} });
    await database.prepare(`INSERT INTO products (id, locale, name, slug, product_code, specifications_json, category_id, status, created_at, updated_at)
      VALUES ('zh-product', 'zh', '中文产品', 'zh-product', 'ES-ZH', '{}', 'cat', 'draft', ?, ?)`)
      .bind(timestamp, timestamp).run();

    const listed = await read(productRoute, "editor", "list", "/api/admin/products/list?q=stem&status=draft&category=cat&page=1&pageSize=1&order=name&direction=asc");
    expect(listed.status).toBe(200);
    await expect(listed.json()).resolves.toMatchObject({
      ok: true,
      data: { items: [{ name: "Alpha stem", locale: "en" }], page: 1, pageSize: 1, total: 2, totalPages: 2 },
    });

    const invalidOrder = await read(productRoute, "editor", "list", "/api/admin/products/list?order=DROP%20TABLE%20products");
    expect(invalidOrder.status).toBe(422);
    expect((await database.prepare("SELECT COUNT(*) AS count FROM products").first<{ count: number }>())?.count).toBe(3);
  });

  it("returns a useful conflict for duplicate English slugs and rejects unversioned or unknown input", async () => {
    await create(productRoute, "editor", { name: "First", slug: "shared", productCode: "ES-1", categoryId: "cat", specifications: {} });
    const duplicate = await create(productRoute, "editor", { name: "Second", slug: "shared", productCode: "ES-2", categoryId: "cat", specifications: {} });
    expect(duplicate.status).toBe(409);
    await expect(duplicate.json()).resolves.toMatchObject({ error: { code: "slug_conflict", fields: { slug: expect.stringContaining("already") } } });

    expect((await mutate(productRoute, "editor", "new", { data: {} })).status).toBe(422);
    expect((await mutate(productRoute, "editor", "new", { version: 1, data: { name: "No", slug: "no", productCode: "NO", categoryId: "cat", specifications: {}, locale: "zh" } })).status).toBe(422);
  });

  it("does not let an edit make already-published content invalid", async () => {
    const created = await create(productRoute, "editor", {
      name: "Published stem", slug: "published-stem", productCode: "ES-PUBLISHED", categoryId: "cat",
      specifications: {}, summary: "Complete summary.", body: "Complete body.",
    });
    const draft = (await body<{ id: string; updatedAt: string }>(created)).data;
    const published = await mutate(productRoute, "editor", draft.id, { version: 1, action: "publish", updatedAt: draft.updatedAt });
    const current = (await body<{ updatedAt: string }>(published)).data;

    const invalidEdit = await mutate(productRoute, "editor", draft.id, {
      version: 1, updatedAt: current.updatedAt, data: { summary: "" },
    });

    expect(invalidEdit.status).toBe(422);
    await expect(invalidEdit.json()).resolves.toMatchObject({ error: { code: "publish_validation", fields: { summary: expect.any(String) } } });
    expect(await database.prepare("SELECT status, summary FROM products WHERE id = ?").bind(draft.id).first()).toEqual({ status: "published", summary: "Complete summary." });
  });

  it("rolls back content when the required audit insert fails", async () => {
    const created = await create(productRoute, "editor", {
      name: "Atomic stem", slug: "atomic-stem", productCode: "ES-ATOMIC", categoryId: "cat", specifications: {},
    });
    const original = (await body<{ id: string; updatedAt: string }>(created)).data;
    await database.prepare(`CREATE TRIGGER reject_content_audit BEFORE INSERT ON audit_logs
      WHEN NEW.entity_id = '${original.id}' BEGIN SELECT RAISE(ABORT, 'forced audit failure'); END`).run();

    const failed = await mutate(productRoute, "editor", original.id, {
      version: 1, updatedAt: original.updatedAt, data: { name: "Mutation must roll back" },
    });

    expect(failed.status).toBe(500);
    expect(await database.prepare("SELECT name, updated_at AS updatedAt FROM products WHERE id = ?").bind(original.id).first()).toEqual({ name: "Atomic stem", updatedAt: original.updatedAt });
    expect((await database.prepare("SELECT COUNT(*) AS total FROM audit_logs WHERE entity_id = ?").bind(original.id).first<{ total: number }>())?.total).toBe(1);
  });

  it("supports create, edit, publish, unpublish, and archive for categories, spaces, articles, and pages", async () => {
    const cases = [
      { route: categoryRoute, data: { name: "Branches", slug: "branches", description: "Architectural branches.", sortOrder: 3, seoTitle: "Branches", seoDescription: "Branch collection." }, update: { description: "Edited branches." } },
      { route: spaceRoute, data: { title: "Quiet lobby", slug: "quiet-lobby", category: "Hospitality", location: "Shanghai", summary: "A permanent botanical lobby.", body: "The complete case study.", seoTitle: "Quiet lobby", seoDescription: "Lobby case study." }, update: { location: "Guangzhou" } },
      { route: articleRoute, data: { title: "Material note", slug: "material-note", summary: "A note on materials.", body: "The complete journal article.", author: "EVERSTEM Studio", seoTitle: "Material note", seoDescription: "Material journal note." }, update: { author: "Studio Team" } },
      { route: pageRoute, data: { pageKey: "studio", sections: [{ type: "hero", title: "Our studio", body: "A considered practice." }], seoTitle: "Studio", seoDescription: "About our studio." }, update: { seoTitle: "The Studio" } },
    ];

    for (const entry of cases) {
      const created = await create(entry.route, "editor", entry.data);
      expect(created.status).toBe(201);
      const createdData = (await body<{ id: string; updatedAt: string }>(created)).data;
      const updated = await mutate(entry.route, "editor", createdData.id, { version: 1, updatedAt: createdData.updatedAt, data: entry.update });
      expect(updated.status).toBe(200);
      const updatedData = (await body<{ updatedAt: string }>(updated)).data;
      const published = await mutate(entry.route, "editor", createdData.id, { version: 1, action: "publish", updatedAt: updatedData.updatedAt });
      expect(published.status).toBe(200);
      const publishedData = (await body<{ updatedAt: string; status: string }>(published)).data;
      expect(publishedData.status).toBe("published");
      const unpublished = await mutate(entry.route, "editor", createdData.id, { version: 1, action: "unpublish", updatedAt: publishedData.updatedAt });
      expect(unpublished.status).toBe(200);
      const unpublishedData = (await body<{ updatedAt: string }>(unpublished)).data;
      expect((await remove(entry.route, "editor", createdData.id, unpublishedData.updatedAt)).status).toBe(200);
    }
  });

  it("validates modular page blocks and rejects expired or tampered preview tokens", async () => {
    const invalidPage = await create(pageRoute, "editor", { pageKey: "bad-page", sections: [{ type: "script", source: "alert(1)" }] });
    expect(invalidPage.status).toBe(422);

    const validPage = await create(pageRoute, "editor", { pageKey: "writer-page", sections: [{ type: "hero", title: "Writer boundary" }] });
    const stored = (await body<{ id: string; updatedAt: string }>(validPage)).data;
    const invalidUpdate = await mutate(pageRoute, "editor", stored.id, {
      version: 1, updatedAt: stored.updatedAt, data: { sections: [{ type: "script", source: "alert(2)" }] },
    });
    expect(invalidUpdate.status).toBe(422);
    expect(await database.prepare("SELECT sections_json AS sections FROM pages WHERE id = ?").bind(stored.id).first()).toEqual({ sections: '[{"type":"hero","title":"Writer boundary"}]' });

    const issuedAt = Date.parse("2026-09-14T12:00:00.000Z");
    const token = await issuePreviewToken({ kind: "page", id: "page-1" }, "test-secret", issuedAt, 60);
    await expect(verifyPreviewToken(token, "test-secret", "page", "page-1", issuedAt + 59_000)).resolves.toMatchObject({ id: "page-1" });
    await expect(verifyPreviewToken(token, "test-secret", "page", "page-1", issuedAt + 61_000)).resolves.toBeNull();
    const [payload, signature] = token.split(".") as [string, string];
    const tamperedSignature = `${signature[0] === "a" ? "b" : "a"}${signature.slice(1)}`;
    await expect(verifyPreviewToken(`${payload}.${tamperedSignature}`, "test-secret", "page", "page-1", issuedAt)).resolves.toBeNull();
  });

  function locals(role: Role) {
    return { runtime: { env: { DB: database, SESSION_SECRET: "test-secret" } }, auth: { id: `${role}-1`, email: `${role}@everstem.test`, displayName: role, role } };
  }

  function invoke(route: Route, method: "GET" | "POST" | "DELETE", role: Role, id: string, url: string, payload?: unknown): Promise<Response> {
    const handler = route[method];
    if (!handler) throw new Error(`Missing ${method} handler`);
    const request = new Request(`https://everstem.test${url}`, {
      method,
      headers: payload === undefined ? undefined : { "content-type": "application/json", origin: "https://everstem.test" },
      body: payload === undefined ? undefined : JSON.stringify(payload),
    });
    return Promise.resolve(handler({ request, params: { id }, locals: locals(role), url: new URL(request.url) } as never));
  }

  function mutate(route: Route, role: Role, id: string, payload: unknown): Promise<Response> {
    return invoke(route, "POST", role, id, `/api/admin/content/${id}`, payload);
  }

  function create(route: Route, role: Role, data: unknown): Promise<Response> {
    return mutate(route, role, "new", { version: 1, data });
  }

  function read(route: Route, role: Role, id: string, url: string): Promise<Response> {
    return invoke(route, "GET", role, id, url);
  }

  function remove(route: Route, role: Role, id: string, updatedAt: string): Promise<Response> {
    return invoke(route, "DELETE", role, id, `/api/admin/content/${id}`, { version: 1, updatedAt });
  }
});

async function body<T>(response: Response): Promise<{ ok: true; data: T }> {
  return response.json() as Promise<{ ok: true; data: T }>;
}

async function seedActorsAndCategory(database: D1Database): Promise<void> {
  for (const role of ["admin", "editor", "sales"] as const) {
    await database.prepare(`INSERT INTO users (id, email, username, display_name, password_hash, role, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'test-hash', ?, ?, ?)`)
      .bind(`${role}-1`, `${role}@everstem.test`, role, role, role, timestamp, timestamp).run();
  }
  await database.prepare("INSERT INTO categories (id, locale, name, slug, description, status, created_at, updated_at) VALUES ('cat', 'en', 'Flowers', 'flowers', 'Flower collection.', 'published', ?, ?)")
    .bind(timestamp, timestamp).run();
}

async function applyMigration(database: D1Database, source: string): Promise<void> {
  for (const statement of source.split(";").map((entry) => entry.trim()).filter(Boolean)) await database.prepare(statement).run();
}
