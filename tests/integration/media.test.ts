import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Miniflare } from "miniflare";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DELETE as deleteRoute, GET as getMediaRecord, PATCH as patchMediaRecord } from "../../src/pages/api/admin/media/[id]";
import { GET as listMedia, POST as uploadRoute, PUT as saveGalleryRoute } from "../../src/pages/api/admin/media/index";
import { GET as serveMedia } from "../../src/pages/media/[key]";
import { deleteMedia, uploadMedia } from "../../src/features/media/service";
import { getPublishedProductBySlug } from "../../src/features/catalog/service";
import { getPublishedSpace, listPublishedSpaces } from "../../src/features/content/service";

const workspace = resolve(import.meta.dirname, "../..");
const jpegBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
const webpBytes = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x04, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50]);
const avifBytes = new Uint8Array([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x61, 0x76, 0x69, 0x66, 0x00, 0x00, 0x00, 0x00]);

describe("R2 media management", () => {
  let miniflare: Miniflare;
  let database: D1Database;
  let bucket: R2Bucket;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-19T08:00:00.000Z"));
    miniflare = new Miniflare({
      modules: true,
      script: "export default { fetch() { return new Response('ok'); } }",
      d1Databases: ["DB"],
      r2Buckets: ["MEDIA"],
    });
    database = await miniflare.getD1Database("DB") as unknown as D1Database;
    bucket = await miniflare.getR2Bucket("MEDIA") as unknown as R2Bucket;
    for (const name of ["0001_initial.sql", "0002_schema_normalization.sql", "0003_rate_limits.sql", "0004_submission_idempotency.sql", "0005_submission_idempotency_ledger.sql", "0006_active_media_references.sql"]) {
      const source = await readFile(resolve(workspace, "migrations", name), "utf8");
      if (name === "0006_active_media_references.sql") await applyTriggerMigration(database, source);
      else await applyMigration(database, source);
    }
    await seedContent(database);
  });

  afterEach(async () => {
    vi.useRealTimers();
    await miniflare.dispose();
  });

  it("lets editors upload a JPEG after magic-byte validation and indexes an immutable R2 key", async () => {
    const response = await uploadRoute(routeContext(uploadRequest(file(jpegBytes, "branch.jpg", "image/jpeg")), "editor") as never);

    expect(response.status).toBe(201);
    const body = await response.json() as { data: { id: string; objectKey: string; mimeType: string; byteSize: number; altText: string } };
    expect(body.data).toMatchObject({ mimeType: "image/jpeg", byteSize: jpegBytes.byteLength, altText: "White magnolia branch" });
    expect(body.data.objectKey).toMatch(/^[0-9a-f-]{36}\.jpg$/u);
    expect(await bucket.head(body.data.objectKey)).not.toBeNull();
    await expect(database.prepare("SELECT object_key, created_by_user_id FROM media WHERE id = ?").bind(body.data.id).first())
      .resolves.toMatchObject({ object_key: body.data.objectKey, created_by_user_id: "editor-1" });
  });

  it("rejects executable bytes, extension/type mismatches, oversized files, unsafe callers, and cross-origin writes", async () => {
    const executable = file(new TextEncoder().encode("#!/bin/sh\necho nope"), "branch.jpg", "image/jpeg");
    expect((await uploadRoute(routeContext(uploadRequest(executable), "editor") as never)).status).toBe(415);
    expect((await uploadRoute(routeContext(uploadRequest(file(pngBytes, "branch.jpg", "image/jpeg")), "editor") as never)).status).toBe(415);

    const tinyLimit = routeContext(uploadRequest(file(jpegBytes, "branch.jpg", "image/jpeg")), "editor", { MEDIA_MAX_BYTES: "5" });
    expect((await uploadRoute(tinyLimit as never)).status).toBe(413);
    expect((await uploadRoute(routeContext(uploadRequest(file(jpegBytes, "branch.jpg", "image/jpeg")), "sales") as never)).status).toBe(403);
    expect((await uploadRoute(routeContext(uploadRequest(file(jpegBytes, "branch.jpg", "image/jpeg")), undefined) as never)).status).toBe(401);

    const wrongOrigin = uploadRequest(file(jpegBytes, "branch.jpg", "image/jpeg"), "https://attacker.test");
    expect((await uploadRoute(routeContext(wrongOrigin, "editor") as never)).status).toBe(403);
    expect((await database.prepare("SELECT COUNT(*) AS count FROM media").first<{ count: number }>())?.count).toBe(0);
  });

  it("accepts WebP and AVIF only when their declared type, extension, and magic bytes agree", async () => {
    const webp = await uploadMedia(env(), file(webpBytes, "branch.webp", "image/webp"), { altText: "WebP branch", createdByUserId: "editor-1" });
    const avif = await uploadMedia(env(), file(avifBytes, "branch.avif", "image/avif"), { altText: "AVIF branch", createdByUserId: "editor-1" });
    expect(webp).toMatchObject({ mimeType: "image/webp", byteSize: webpBytes.length });
    expect(avif).toMatchObject({ mimeType: "image/avif", byteSize: avifBytes.length });
    await expect(uploadMedia(env(), file(webpBytes, "branch.avif", "image/avif"), { altText: "Mismatch", createdByUserId: "editor-1" })).rejects.toThrow("Upload a JPG");
  });

  it("removes the R2 object when the D1 index insert fails so an upload can be retried safely", async () => {
    const failingDb = new Proxy(database, {
      get(target, property, receiver) {
        if (property === "prepare") {
          return (query: string) => query.startsWith("INSERT INTO media")
            ? { bind: () => ({ run: async () => { throw new Error("forced D1 failure"); } }) }
            : target.prepare(query);
        }
        return Reflect.get(target, property, receiver);
      },
    }) as D1Database;

    const expectedLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      await expect(uploadMedia({ DB: failingDb, MEDIA: bucket, MEDIA_MAX_BYTES: "1024" }, file(jpegBytes, "retry.jpg", "image/jpeg"), {
        altText: "Retry magnolia stem",
        createdByUserId: "editor-1",
      })).rejects.toThrow("Unable to index the uploaded image");
    } finally {
      expectedLog.mockRestore();
    }
    expect((await bucket.list()).objects).toHaveLength(0);

    const retried = await uploadMedia(env(), file(jpegBytes, "retry.jpg", "image/jpeg"), {
      altText: "Retry magnolia stem",
      createdByUserId: "editor-1",
    });
    expect(await bucket.head(retried.objectKey)).not.toBeNull();
  });

  it("lists and edits reusable media metadata for admins and editors", async () => {
    const uploaded = await uploadMedia(env(), file(jpegBytes, "library.jpg", "image/jpeg"), {
      altText: "Original library description",
      createdByUserId: "editor-1",
    });
    const listed = await listMedia(routeContext(new Request("https://everstem.test/api/admin/media?q=library"), "editor") as never);
    expect(listed.status).toBe(200);
    await expect(listed.json()).resolves.toMatchObject({ data: { total: 1, items: [{ id: uploaded.id, url: `/media/${uploaded.objectKey}` }] } });

    const patched = await patchMediaRecord(routeContext(jsonRequest(`https://everstem.test/api/admin/media/${uploaded.id}`, "PATCH", { version: 1, altText: "Updated magnolia detail" }), "admin", {}, uploaded.id) as never);
    expect(patched.status).toBe(200);
    await expect(patched.json()).resolves.toMatchObject({ data: { id: uploaded.id, altText: "Updated magnolia detail" } });

    const fetched = await getMediaRecord(routeContext(new Request(`https://everstem.test/api/admin/media/${uploaded.id}`), "editor", {}, uploaded.id) as never);
    await expect(fetched.json()).resolves.toMatchObject({ data: { id: uploaded.id, altText: "Updated magnolia detail" } });

    const missingAlt = await patchMediaRecord(routeContext(jsonRequest(`https://everstem.test/api/admin/media/${uploaded.id}`, "PATCH", { version: 1 }), "admin", {}, uploaded.id) as never);
    expect(missingAlt.status).toBe(422);
  });

  it("assigns ordered product galleries with one cover and meaningful English alt text", async () => {
    const first = await uploadMedia(env(), file(jpegBytes, "first.jpg", "image/jpeg"), { altText: "First", createdByUserId: "editor-1" });
    const second = await uploadMedia(env(), file(pngBytes, "second.png", "image/png"), { altText: "Second", createdByUserId: "editor-1" });

    const missingEnglish = await saveGalleryRoute(routeContext(jsonRequest("https://everstem.test/api/admin/media", "PUT", {
      version: 1,
      entity: "product",
      contentId: "product-1",
      items: [{ mediaId: first.id, altText: "白色花枝", isCover: true }],
    }), "editor") as never);
    expect(missingEnglish.status).toBe(422);

    const saved = await saveGalleryRoute(routeContext(jsonRequest("https://everstem.test/api/admin/media", "PUT", {
      version: 1,
      entity: "product",
      contentId: "product-1",
      items: [
        { mediaId: second.id, altText: "Renée’s open magnolia — detail", isCover: true },
        { mediaId: first.id, altText: "Full magnolia branch", isCover: false },
      ],
    }), "editor") as never);
    expect(saved.status).toBe(200);
    await expect(saved.json()).resolves.toMatchObject({ data: { items: [
      { mediaId: second.id, sortOrder: 0, isCover: true, altText: "Renée’s open magnolia — detail" },
      { mediaId: first.id, sortOrder: 1, isCover: false, altText: "Full magnolia branch" },
    ] } });
    await expect(database.prepare("SELECT cover_media_id FROM products WHERE id = 'product-1'").first()).resolves.toMatchObject({ cover_media_id: second.id });

    const loaded = await listMedia(routeContext(new Request("https://everstem.test/api/admin/media?entity=product&contentId=product-1"), "editor") as never);
    await expect(loaded.json()).resolves.toMatchObject({ data: { entity: "product", contentId: "product-1", items: [
      { mediaId: second.id, sortOrder: 0, isCover: true },
      { mediaId: first.id, sortOrder: 1, isCover: false },
    ] } });

    await database.prepare("UPDATE products SET status = 'published' WHERE id = 'product-1'").run();
    const publicProduct = await getPublishedProductBySlug(database, "en", "magnolia");
    expect(publicProduct?.image?.src).toBe(`/media/${second.objectKey}`);
    expect(publicProduct?.images).toEqual([
      { src: `/media/${second.objectKey}`, alt: "Renée’s open magnolia — detail" },
      { src: `/media/${first.objectKey}`, alt: "Full magnolia branch" },
    ]);
  });

  it("supports space gallery ordering and cover selection through the parent cover", async () => {
    const first = await uploadMedia(env(), file(jpegBytes, "room.jpg", "image/jpeg"), { altText: "Room", createdByUserId: "editor-1" });
    const second = await uploadMedia(env(), file(pngBytes, "detail.png", "image/png"), { altText: "Detail", createdByUserId: "editor-1" });
    const response = await saveGalleryRoute(routeContext(jsonRequest("https://everstem.test/api/admin/media", "PUT", {
      version: 1, entity: "space", contentId: "space-1", items: [
        { mediaId: first.id, altText: "Hospitality room installation", isCover: false },
        { mediaId: second.id, altText: "Installation detail", isCover: true },
      ],
    }), "admin") as never);
    expect(response.status).toBe(200);
    await expect(database.prepare("SELECT cover_media_id FROM spaces WHERE id = 'space-1'").first()).resolves.toMatchObject({ cover_media_id: second.id });
    const rows = await database.prepare("SELECT media_id, sort_order FROM space_images WHERE space_id = 'space-1' ORDER BY sort_order").all();
    expect(rows.results).toEqual([{ media_id: first.id, sort_order: 0 }, { media_id: second.id, sort_order: 1 }]);

    await database.prepare("UPDATE spaces SET status = 'published' WHERE id = 'space-1'").run();
    await database.batch([
      database.prepare(`INSERT INTO spaces (id, locale, title, slug, category, summary, body, cover_media_id, status, created_at, updated_at)
        VALUES ('space-related', 'en', 'Related lobby', 'related-lobby', 'Hospitality', 'Related summary', 'Related body', ?, 'published', ?, ?)`)
        .bind(first.id, "2026-09-01T00:00:00.000Z", "2026-09-01T00:00:00.000Z"),
      database.prepare(`INSERT INTO space_images (id, space_id, media_id, alt_text, sort_order, created_at)
        VALUES ('space-related-cover', 'space-related', ?, 'Related lobby assigned cover', 0, ?)`)
        .bind(first.id, "2026-09-01T00:00:00.000Z"),
    ]);
    const publicSpaces = await listPublishedSpaces(database, "en");
    expect(publicSpaces).toEqual(expect.arrayContaining([
      expect.objectContaining({ slug: "lobby", image: { src: `/media/${second.objectKey}`, alt: "Installation detail" } }),
      expect.objectContaining({ slug: "related-lobby", image: { src: `/media/${first.objectKey}`, alt: "Related lobby assigned cover" } }),
    ]));
    const publicSpace = await getPublishedSpace(database, "en", "lobby");
    expect(publicSpace?.images[0]).toEqual({ src: `/media/${second.objectKey}`, alt: "Installation detail" });
    expect(publicSpace?.relatedSpaces).toEqual([
      expect.objectContaining({ slug: "related-lobby", image: { src: `/media/${first.objectKey}`, alt: "Related lobby assigned cover" } }),
    ]);

    await database.prepare("UPDATE spaces SET status = 'archived' WHERE id = 'space-1'").run();
    const archived = await saveGalleryRoute(routeContext(jsonRequest("https://everstem.test/api/admin/media", "PUT", {
      version: 1, entity: "space", contentId: "space-1", items: [{ mediaId: first.id, altText: "Archived room", isCover: true }],
    }), "admin") as never);
    expect(archived.status).toBe(422);
  });

  it("protects referenced media from deletion and deletes an unreferenced object plus index state", async () => {
    const referenced = await uploadMedia(env(), file(jpegBytes, "referenced.jpg", "image/jpeg"), { altText: "Referenced", createdByUserId: "editor-1" });
    await database.prepare("UPDATE products SET cover_media_id = ? WHERE id = 'product-1'").bind(referenced.id).run();
    const blocked = await deleteRoute(routeContext(deleteRequest(referenced.id), "admin", {}, referenced.id) as never);
    expect(blocked.status).toBe(409);
    expect(await bucket.head(referenced.objectKey)).not.toBeNull();

    const unused = await uploadMedia(env(), file(pngBytes, "unused.png", "image/png"), { altText: "Unused", createdByUserId: "editor-1" });
    const removed = await deleteRoute(routeContext(deleteRequest(unused.id), "editor", {}, unused.id) as never);
    expect(removed.status).toBe(200);
    await expect(removed.json()).resolves.toEqual({ ok: true, data: { deleted: true } });
    expect(await bucket.head(unused.objectKey)).toBeNull();
    await expect(database.prepare("SELECT is_deleted, deleted_at FROM media WHERE id = ?").bind(unused.id).first()).resolves.toMatchObject({ is_deleted: 1, deleted_at: "2026-09-19T08:00:00.000Z" });
    await expect(database.prepare("SELECT action, entity_type, entity_id, actor_user_id FROM audit_logs WHERE entity_id = ?").bind(unused.id).first())
      .resolves.toEqual({ action: "delete", entity_type: "media", entity_id: unused.id, actor_user_id: "editor-1" });
  });

  it("protects media embedded in managed page sections", async () => {
    const referenced = await uploadMedia(env(), file(jpegBytes, "page-hero.jpg", "image/jpeg"), { altText: "Page hero magnolia", createdByUserId: "editor-1" });
    await database.prepare(`INSERT INTO pages (id, page_key, locale, sections_json, status, created_at, updated_at)
      VALUES ('page-r2', 'r2-page', 'en', ?, 'draft', ?, ?)`)
      .bind(JSON.stringify([{ type: "hero", title: "R2 page", image: { src: `/media/${referenced.objectKey}`, alt: "Page hero magnolia" } }]), "2026-09-19T08:00:00.000Z", "2026-09-19T08:00:00.000Z").run();

    const blocked = await deleteRoute(routeContext(deleteRequest(referenced.id), "admin", {}, referenced.id) as never);
    expect(blocked.status).toBe(409);
    await expect(blocked.json()).resolves.toMatchObject({ error: { code: "media_referenced" } });
    expect(await bucket.head(referenced.objectKey)).not.toBeNull();
  });

  it("restores the object when a content reference appears during deletion", async () => {
    const uploaded = await uploadMedia(env(), file(jpegBytes, "racing-reference.jpg", "image/jpeg"), { altText: "Racing reference", createdByUserId: "editor-1" });
    const racingBucket = new Proxy(bucket, {
      get(target, property) {
        if (property === "delete") return async (key: string) => {
          await target.delete(key);
          await database.prepare("UPDATE products SET cover_media_id = ? WHERE id = 'product-1'").bind(uploaded.id).run();
        };
        const value = Reflect.get(target, property);
        return typeof value === "function" ? value.bind(target) : value;
      },
    }) as R2Bucket;

    await expect(deleteMedia({ ...env(), MEDIA: racingBucket }, uploaded.id, "admin-1")).rejects.toMatchObject({ status: 409, code: "media_referenced" });
    expect(await bucket.head(uploaded.objectKey)).not.toBeNull();
    await expect(database.prepare("SELECT is_deleted FROM media WHERE id = ?").bind(uploaded.id).first()).resolves.toEqual({ is_deleted: 0 });
  });

  it("atomically rejects a gallery save when deletion wins after the availability preflight", async () => {
    const uploaded = await uploadMedia(env(), file(jpegBytes, "concurrent.jpg", "image/jpeg"), { altText: "Concurrent branch", createdByUserId: "editor-1" });
    let releaseBatch!: () => void;
    let batchReached!: () => void;
    const batchIsReached = new Promise<void>((resolve) => { batchReached = resolve; });
    const batchCanContinue = new Promise<void>((resolve) => { releaseBatch = resolve; });
    let paused = false;
    const delayedDatabase = new Proxy(database, {
      get(target, property) {
        if (property === "batch") return async (statements: D1PreparedStatement[]) => {
          if (!paused) {
            paused = true;
            batchReached();
            await batchCanContinue;
          }
          return target.batch(statements);
        };
        const value = Reflect.get(target, property);
        return typeof value === "function" ? value.bind(target) : value;
      },
    }) as D1Database;

    const saving = saveGalleryRoute(routeContext(jsonRequest("https://everstem.test/api/admin/media", "PUT", {
      version: 1,
      entity: "product",
      contentId: "product-1",
      items: [{ mediaId: uploaded.id, altText: "Concurrent magnolia branch", isCover: true }],
    }), "editor", { DB: delayedDatabase }) as never);
    await batchIsReached;
    await expect(deleteMedia(env(), uploaded.id, "admin-1")).resolves.toEqual({ deleted: true });
    releaseBatch();

    const response = await saving;
    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "invalid_media", fields: { items: expect.any(String) } } });
    await expect(database.prepare("SELECT cover_media_id FROM products WHERE id = 'product-1'").first()).resolves.toEqual({ cover_media_id: null });
    await expect(database.prepare("SELECT COUNT(*) AS total FROM product_images WHERE product_id = 'product-1'").first()).resolves.toEqual({ total: 0 });
  });

  it("serves immutable media with its content type and ETag and honors conditional requests", async () => {
    const uploaded = await uploadMedia(env(), file(jpegBytes, "public.jpg", "image/jpeg"), { altText: "Public", createdByUserId: "editor-1" });
    const response = await serveMedia({ request: new Request(`https://everstem.test/media/${uploaded.objectKey}`), params: { key: uploaded.objectKey }, locals: { runtime: { env: env() } } } as never);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/jpeg");
    expect(response.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
    expect(response.headers.get("etag")).toMatch(/^".+"$/u);
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(jpegBytes);

    const notModified = await serveMedia({ request: new Request(`https://everstem.test/media/${uploaded.objectKey}`, { headers: { "if-none-match": response.headers.get("etag") ?? "" } }), params: { key: uploaded.objectKey }, locals: { runtime: { env: env() } } } as never);
    expect(notModified.status).toBe(304);
    expect((await serveMedia({ request: new Request("https://everstem.test/media/not-safe"), params: { key: "../not-safe" }, locals: { runtime: { env: env() } } } as never)).status).toBe(404);
  });

  function env(): { DB: D1Database; MEDIA: R2Bucket; MEDIA_MAX_BYTES: string; SESSION_SECRET: string } {
    return { DB: database, MEDIA: bucket, MEDIA_MAX_BYTES: "1024", SESSION_SECRET: "test-secret" };
  }

  function routeContext(request: Request, role?: "admin" | "editor" | "sales", extraEnv: Record<string, unknown> = {}, id?: string) {
    return {
      request,
      params: id ? { id } : {},
      locals: {
        runtime: { env: { ...env(), ...extraEnv } },
        ...(role ? { auth: { id: `${role}-1`, email: `${role}@everstem.test`, displayName: role, role } } : {}),
      },
    };
  }
});

function file(bytes: Uint8Array, name: string, type: string): File {
  return new File([bytes], name, { type });
}

function uploadRequest(image: File, origin = "https://everstem.test"): Request {
  const data = new FormData();
  data.set("file", image);
  data.set("altText", "White magnolia branch");
  return new Request("https://everstem.test/api/admin/media", { method: "POST", headers: { origin }, body: data });
}

function jsonRequest(url: string, method: string, body: unknown): Request {
  return new Request(url, { method, headers: { origin: "https://everstem.test", "content-type": "application/json" }, body: JSON.stringify(body) });
}

function deleteRequest(id: string): Request {
  return new Request(`https://everstem.test/api/admin/media/${id}`, { method: "DELETE", headers: { origin: "https://everstem.test" } });
}

async function seedContent(database: D1Database): Promise<void> {
  const now = "2026-09-01T00:00:00.000Z";
  await database.batch([
    database.prepare("INSERT INTO users (id, email, username, display_name, password_hash, role, created_at, updated_at) VALUES ('admin-1', 'admin@test', 'admin', 'Admin', 'hash', 'admin', ?, ?)").bind(now, now),
    database.prepare("INSERT INTO users (id, email, username, display_name, password_hash, role, created_at, updated_at) VALUES ('editor-1', 'editor@test', 'editor', 'Editor', 'hash', 'editor', ?, ?)").bind(now, now),
    database.prepare("INSERT INTO users (id, email, username, display_name, password_hash, role, created_at, updated_at) VALUES ('sales-1', 'sales@test', 'sales', 'Sales', 'hash', 'sales', ?, ?)").bind(now, now),
    database.prepare("INSERT INTO categories (id, locale, name, slug, status, created_at, updated_at) VALUES ('category-1', 'en', 'Flowers', 'flowers', 'published', ?, ?)").bind(now, now),
    database.prepare("INSERT INTO products (id, locale, name, slug, product_code, summary, body, specifications_json, category_id, status, created_at, updated_at) VALUES ('product-1', 'en', 'Magnolia', 'magnolia', 'ES-1', 'Summary', 'Body', '{}', 'category-1', 'draft', ?, ?)").bind(now, now),
    database.prepare("INSERT INTO spaces (id, locale, title, slug, category, summary, body, status, created_at, updated_at) VALUES ('space-1', 'en', 'Lobby', 'lobby', 'Hospitality', 'Summary', 'Body', 'draft', ?, ?)").bind(now, now),
  ]);
}

async function applyMigration(database: D1Database, source: string): Promise<void> {
  for (const statement of source.split(";").map((entry) => entry.trim()).filter(Boolean)) await database.prepare(statement).run();
}

async function applyTriggerMigration(database: D1Database, source: string): Promise<void> {
  for (const match of source.matchAll(/CREATE TRIGGER[\s\S]*?END;/gu)) {
    await database.prepare(match[0].slice(0, -1)).run();
  }
}
