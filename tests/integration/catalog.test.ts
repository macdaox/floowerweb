import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Miniflare } from "miniflare";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getPublishedProductBySlug, listPublishedProducts } from "../../src/features/catalog/service";

const workspace = resolve(import.meta.dirname, "../..");
const now = "2026-09-13T00:00:00.000Z";

describe("public catalog reads", () => {
  let miniflare: Miniflare;
  let database: D1Database;

  beforeEach(async () => {
    miniflare = new Miniflare({
      modules: true,
      script: "export default { fetch() { return new Response('ok'); } }",
      d1Databases: ["DB"],
    });
    database = await miniflare.getD1Database("DB") as unknown as D1Database;
    for (const name of ["0001_initial.sql", "0002_schema_normalization.sql", "0003_rate_limits.sql"]) {
      await applyMigration(database, await readFile(resolve(workspace, "migrations", name), "utf8"));
    }
  });

  afterEach(async () => {
    await miniflare.dispose();
  });

  it("exposes only published English products under published English categories, in 24-item pages", async () => {
    await category("flowers-en", "en", "flowers", "published");
    await category("flowers-de", "de", "flowers", "published");
    await product("foreign-category", "en", "foreign-category-stem", "flowers-de", "published");
    await product("draft", "en", "draft-product", "flowers-en", "draft");
    for (let index = 1; index <= 25; index += 1) {
      await product(`product-${index}`, "en", `product-${index}`, "flowers-en", "published");
    }

    const first = await listPublishedProducts(database, { locale: "en", page: 1 });
    const second = await listPublishedProducts(database, { locale: "en", page: 2 });

    expect(first).toMatchObject({ page: 1, pageSize: 24, total: 25, totalPages: 2 });
    expect(first.items).toHaveLength(24);
    expect(second.items.map((item) => item.slug)).toEqual(["product-9"]);
    await expect(getPublishedProductBySlug(database, "en", "foreign-category-stem")).resolves.toBeNull();
    await expect(getPublishedProductBySlug(database, "en", "draft-product")).resolves.toBeNull();
  });

  it("returns a product gallery, specifications, and related products without a price", async () => {
    await category("flowers-en", "en", "flowers", "published");
    await media("cover", "cover.jpg", "Magnolia cover");
    await media("detail", "detail.jpg", "Magnolia detail");
    await product("magnolia", "en", "magnolia-stem", "flowers-en", "published", "cover");
    await product("related", "en", "related-stem", "flowers-en", "published");
    await database.prepare(`INSERT INTO product_images (id, product_id, media_id, alt_text, sort_order, is_cover, created_at)
      VALUES ('magnolia-detail', 'magnolia', 'detail', 'Petal close-up', 1, 0, ?)`)
      .bind(now).run();

    const productDetail = await getPublishedProductBySlug(database, "en", "magnolia-stem");

    expect(productDetail).toMatchObject({
      name: "Magnolia stem",
      specifications: [{ label: "Material", value: "Textile" }],
      relatedProducts: [{ slug: "related-stem" }],
    });
    expect(productDetail?.images).toEqual([
      { src: "/assets/cover.jpg", alt: "Magnolia cover" },
      { src: "/assets/detail.jpg", alt: "Petal close-up" },
    ]);
    expect(productDetail).not.toHaveProperty("price");
  });

  async function category(id: string, locale: string, slug: string, status: "draft" | "published") {
    await database.prepare(`INSERT INTO categories (id, locale, name, slug, sort_order, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, 0, ?, ?, ?)`)
      .bind(id, locale, `Flowers ${locale}`, slug, status, now, now).run();
  }

  async function product(id: string, locale: string, slug: string, categoryId: string, status: "draft" | "published", coverMediaId?: string) {
    await database.prepare(`INSERT INTO products (id, locale, name, slug, product_code, summary, body, specifications_json, category_id, cover_media_id, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(id, locale, slug === "magnolia-stem" ? "Magnolia stem" : slug, slug, `ES-${id}`, "A product summary", "A product body", '{"material":"Textile"}', categoryId, coverMediaId ?? null, status, now, now).run();
  }

  async function media(id: string, filename: string, altText: string) {
    await database.prepare(`INSERT INTO media (id, object_key, original_filename, mime_type, byte_size, alt_text, is_deleted, created_at, updated_at)
      VALUES (?, ?, ?, 'image/jpeg', 1, ?, 0, ?, ?)`)
      .bind(id, `products/${filename}`, filename, altText, now, now).run();
  }
});

async function applyMigration(database: D1Database, source: string): Promise<void> {
  for (const statement of source.split(";").map((entry) => entry.trim()).filter(Boolean)) {
    await database.prepare(statement).run();
  }
}
