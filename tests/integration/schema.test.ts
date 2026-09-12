import { execFileSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const workspace = resolve(import.meta.dirname, "../..");
const requiredTables = [
  "users", "sessions", "categories", "products", "product_images", "spaces", "space_images",
  "articles", "pages", "media", "inquiries", "inquiry_interests", "inquiry_notes", "subscribers",
  "settings", "audit_logs",
];

describe("initial D1 schema", () => {
  let configDirectory: string;
  let configPath: string;

  beforeAll(async () => {
    configDirectory = await mkdtemp(join(tmpdir(), "everstem-d1-schema-"));
    configPath = join(configDirectory, "wrangler.toml");
    await writeFile(
      configPath,
      `name = "everstem-schema-test"
compatibility_date = "2026-09-13"

[[d1_databases]]
binding = "DB"
database_name = "everstem-schema-test-${Date.now()}"
database_id = "00000000-0000-0000-0000-000000000000"
migrations_dir = "${resolve(workspace, "migrations")}"\n`,
    );
    runWrangler(["d1", "migrations", "apply", "DB", "--local", "--config", configPath]);
  }, 30_000);

  afterAll(async () => {
    await rm(configDirectory, { force: true, recursive: true });
  });

  it("creates every required table and inquiry status constraint in local D1", () => {
    const names = query("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").map((row) => row.name);
    expect(names).toEqual(expect.arrayContaining(requiredTables));

    expect(() => execute(validInquiry("invalid"))).toThrow(/CHECK constraint failed/);
    expect(() => execute(validInquiry("new"))).not.toThrow();
  });

  it("enforces localized slugs, product codes, gallery uniqueness, and foreign keys", () => {
    const now = "2026-09-13T00:00:00.000Z";
    execute(`INSERT INTO categories (id, locale, name, slug, sort_order, status, created_at, updated_at)
      VALUES ('category-1', 'en', 'Artificial flowers', 'flowers', 0, 'published', '${now}', '${now}');
      INSERT INTO media (id, object_key, original_filename, mime_type, byte_size, is_deleted, created_at, updated_at)
      VALUES ('media-1', 'test/image.jpg', 'image.jpg', 'image/jpeg', 1, 0, '${now}', '${now}');
      INSERT INTO products (id, locale, name, slug, product_code, category_id, specifications_json, status, created_at, updated_at)
      VALUES ('product-1', 'en', 'Magnolia stem', 'magnolia-stem', 'ES-MAG-001', 'category-1', '{}', 'published', '${now}', '${now}');
      INSERT INTO product_images (id, product_id, media_id, created_at) VALUES ('product-image-1', 'product-1', 'media-1', '${now}')`);
    expect(() => execute(`INSERT INTO categories (id, locale, name, slug, sort_order, status, created_at, updated_at)
      VALUES ('category-2', 'en', 'Duplicate', 'flowers', 1, 'published', '${now}', '${now}')`)).toThrow(/UNIQUE constraint failed/);
    expect(() => execute(`INSERT INTO products (id, locale, name, slug, product_code, category_id, specifications_json, status, created_at, updated_at)
      VALUES ('product-2', 'en', 'Duplicate code', 'magnolia-stem-two', 'ES-MAG-001', 'category-1', '{}', 'published', '${now}', '${now}')`)).toThrow(/UNIQUE constraint failed/);
    expect(() => execute(`INSERT INTO products (id, locale, name, slug, product_code, category_id, specifications_json, status, created_at, updated_at)
      VALUES ('product-3', 'en', 'Orphan', 'orphan-stem', 'ES-ORP-001', 'missing-category', '{}', 'draft', '${now}', '${now}')`)).toThrow(/FOREIGN KEY constraint failed/);

    expect(() => execute(`INSERT INTO product_images (id, product_id, media_id, created_at) VALUES ('product-image-2', 'product-1', 'media-1', '${now}')`)).toThrow(/UNIQUE constraint failed/);
  });

  it("normalizes inquiry interests and restricts JSON columns to bounded content", () => {
    const schema = query(`SELECT 'inquiries' AS object, group_concat(name) AS detail FROM pragma_table_info('inquiries')
      UNION ALL SELECT 'settings', group_concat(name) FROM pragma_table_info('settings')
      UNION ALL SELECT 'audit_logs', group_concat(name) FROM pragma_table_info('audit_logs')
      UNION ALL SELECT 'inquiry_interests', group_concat(name) FROM pragma_table_info('inquiry_interests')
      UNION ALL SELECT name, sql FROM sqlite_master WHERE type = 'table' AND name IN ('products', 'pages')`);
    const detail = (name: string) => String(schema.find((row) => row.object === name)?.detail);

    expect(detail("inquiries")).not.toContain("interests_json");
    expect(detail("settings")).not.toContain("value_json");
    expect(detail("audit_logs")).not.toContain("context_json");
    expect(detail("inquiry_interests")).toContain("inquiry_id,interest");
    expect(detail("products")).toContain("specifications_json");
    expect(detail("pages")).toContain("sections_json");
  });

  it("runs the configured local seed twice without duplicate demo records", () => {
    runNpm(["run", "db:seed:local", "--", "--config", configPath, "--database", "DB"]);
    runNpm(["run", "db:seed:local", "--", "--config", configPath, "--database", "DB"]);

    expect(query(`SELECT (SELECT COUNT(*) FROM categories) AS categories, (SELECT COUNT(*) FROM products) AS products,
      (SELECT COUNT(*) FROM articles) AS articles, (SELECT name FROM products WHERE locale = 'en' AND slug = 'magnolia-stem') AS magnolia`)).toEqual([
      { categories: 6, products: 5, articles: 3, magnolia: "Magnolia stem" },
    ]);
  }, 30_000);

  function query(sql: string): Array<Record<string, unknown>> {
    return JSON.parse(runWrangler(["d1", "execute", "DB", "--local", "--config", configPath, "--command", sql, "--json"]))[0].results;
  }

  function execute(sql: string): void {
    runWrangler(["d1", "execute", "DB", "--local", "--config", configPath, "--command", sql]);
  }

  function validInquiry(status: string): string {
    return `INSERT INTO inquiries (id, inquiry_type, name, email, status, created_at, updated_at)
      VALUES ('inquiry-${status}', 'catalog', 'Ava Buyer', 'ava-${status}@example.com', '${status}', '2026-09-13T00:00:00.000Z', '2026-09-13T00:00:00.000Z')`;
  }
});

function runWrangler(args: string[]): string {
  return runNpm(["exec", "wrangler", "--", ...args]);
}

function runNpm(args: string[]): string {
  try {
    return execFileSync("npm", args, { cwd: workspace, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  } catch (error) {
    const failed = error as { stderr?: string; stdout?: string };
    throw new Error(`${failed.stdout ?? ""}${failed.stderr ?? ""}`);
  }
}
