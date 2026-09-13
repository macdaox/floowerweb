import { execFileSync } from "node:child_process";
import { copyFile, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const workspace = resolve(import.meta.dirname, "../..");
const requiredTables = [
  "users", "sessions", "categories", "products", "product_images", "spaces", "space_images",
  "articles", "pages", "media", "inquiries", "inquiry_interests", "inquiry_notes", "subscribers",
  "settings", "audit_logs", "rate_limits",
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

  it("applies the forward-only normalization migration after the initial schema", () => {
    const migrations = query("SELECT name FROM d1_migrations ORDER BY id").map((row) => row.name);
    expect(migrations).toEqual(["0001_initial.sql", "0002_schema_normalization.sql", "0003_rate_limits.sql", "0004_submission_idempotency.sql"]);
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

  it("upgrades an old-0001 database and seeds the normalized schema idempotently", async () => {
    const upgradeDirectory = await mkdtemp(join(tmpdir(), "everstem-d1-upgrade-"));
    const oldMigrationsDirectory = join(upgradeDirectory, "old-migrations");
    const upgradeConfig = join(upgradeDirectory, "wrangler.toml");
    const databaseName = `everstem-upgrade-test-${Date.now()}`;
    const writeConfig = (migrationsDir: string) => writeFile(
      upgradeConfig,
      `name = "everstem-upgrade-test"
compatibility_date = "2026-09-13"

[[d1_databases]]
binding = "DB"
database_name = "${databaseName}"
database_id = "00000000-0000-0000-0000-000000000000"
migrations_dir = "${migrationsDir}"\n`,
    );
    const runUpgrade = (args: string[]) => runWrangler([...args, "--config", upgradeConfig]);
    const executeUpgrade = (sql: string) => runUpgrade(["d1", "execute", "DB", "--local", "--command", sql]);
    const queryUpgrade = (sql: string): Array<Record<string, unknown>> =>
      JSON.parse(runUpgrade(["d1", "execute", "DB", "--local", "--command", sql, "--json"]))[0].results;

    try {
      await mkdir(oldMigrationsDirectory);
      await copyFile(resolve(workspace, "migrations/0001_initial.sql"), join(oldMigrationsDirectory, "0001_initial.sql"));
      await writeConfig(oldMigrationsDirectory);
      runUpgrade(["d1", "migrations", "apply", "DB", "--local"]);
      executeUpgrade(`INSERT INTO inquiries (id, inquiry_type, name, email, interests_json, status, created_at, updated_at)
        VALUES ('legacy-inquiry', 'catalog', 'Legacy Buyer', 'legacy@example.com', '["Artificial flowers", "Artificial branches"]', 'new', '2026-09-13T00:00:00.000Z', '2026-09-13T00:00:00.000Z');
        INSERT INTO settings (key, value_json, created_at, updated_at)
        VALUES ('legacy-site', '{"companyName":"Legacy Stem","tagline":"A legacy site"}', '2026-09-13T00:00:00.000Z', '2026-09-13T00:00:00.000Z');
        INSERT INTO settings (key, value_json, created_at, updated_at)
        VALUES ('legacy-plain', 'A useful legacy setting', '2026-09-13T00:00:00.000Z', '2026-09-13T00:00:00.000Z');
        INSERT INTO audit_logs (id, action, entity_type, entity_id, context_json, created_at)
        VALUES ('legacy-audit', 'seed', 'settings', 'legacy-site', '{"source":"legacy"}', '2026-09-13T00:00:00.000Z')`);

      await writeConfig(resolve(workspace, "migrations"));
      runUpgrade(["d1", "migrations", "apply", "DB", "--local"]);
      expect(queryUpgrade(`SELECT
        (SELECT group_concat(interest, ',') FROM (SELECT interest FROM inquiry_interests WHERE inquiry_id = 'legacy-inquiry' ORDER BY interest)) AS interests,
        (SELECT company_name FROM settings WHERE id = 'legacy-site') AS company_name,
        (SELECT company_name FROM settings WHERE id = 'legacy-plain') AS plain_company_name,
        quote((SELECT tagline FROM settings WHERE id = 'legacy-plain')) AS plain_tagline_sql,
        (SELECT context_text FROM audit_logs WHERE id = 'legacy-audit') AS context_text`)).toEqual([
        {
          interests: "Artificial branches,Artificial flowers",
          company_name: "Legacy Stem",
          plain_company_name: "A useful legacy setting",
          plain_tagline_sql: "NULL",
          context_text: '{"source":"legacy"}',
        },
      ]);

      runNpm(["run", "db:seed:local", "--", "--config", upgradeConfig, "--database", "DB"]);
      runNpm(["run", "db:seed:local", "--", "--config", upgradeConfig, "--database", "DB"]);
      expect(queryUpgrade(`SELECT (SELECT COUNT(*) FROM categories) AS categories, (SELECT COUNT(*) FROM products) AS products,
        (SELECT COUNT(*) FROM articles) AS articles, (SELECT name FROM products WHERE locale = 'en' AND slug = 'magnolia-stem') AS magnolia`)).toEqual([
        { categories: 5, products: 5, articles: 3, magnolia: "Magnolia stem" },
      ]);
    } finally {
      await rm(upgradeDirectory, { force: true, recursive: true });
    }
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
