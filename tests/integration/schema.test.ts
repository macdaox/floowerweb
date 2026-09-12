import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDb } from "../../src/lib/db/client";
import { seedDemoContent } from "../../scripts/seed";

const require = createRequire(import.meta.url);
const { DatabaseSync } = require("node:sqlite") as {
  DatabaseSync: new (location: string) => {
    close(): void;
    exec(sql: string): void;
    prepare(sql: string): {
      all(...values: unknown[]): unknown[];
      run(...values: unknown[]): unknown;
    };
  };
};

const requiredTables = [
  "users",
  "sessions",
  "categories",
  "products",
  "product_images",
  "spaces",
  "space_images",
  "articles",
  "pages",
  "media",
  "inquiries",
  "inquiry_notes",
  "subscribers",
  "settings",
  "audit_logs",
];

describe("initial D1 schema", () => {
  let db: TestD1Database;

  beforeEach(() => {
    db = new TestD1Database();
  });

  afterEach(() => {
    db.close();
  });

  it("creates every required table and inquiry status constraint", async () => {
    await applyMigration(db, "migrations/0001_initial.sql");
    const names = await tableNames(db);

    expect(names).toEqual(expect.arrayContaining(requiredTables));
    await expect(insertInquiry(db, "invalid")).rejects.toThrow();
    await expect(insertInquiry(db, "new")).resolves.toBeUndefined();
  });

  it("enforces localized slugs, product codes, and content foreign keys", async () => {
    await applyMigration(db, "migrations/0001_initial.sql");
    const now = "2026-09-13T00:00:00.000Z";

    await db
      .prepare(
        "INSERT INTO categories (id, locale, name, slug, sort_order, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .bind("category-1", "en", "Artificial flowers", "flowers", 0, "published", now, now)
      .run();

    await expect(
      db
        .prepare(
          "INSERT INTO categories (id, locale, name, slug, sort_order, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .bind("category-2", "en", "Duplicate", "flowers", 1, "published", now, now)
        .run(),
    ).rejects.toThrow();

    await db
      .prepare(
        "INSERT INTO products (id, locale, name, slug, product_code, category_id, specifications_json, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .bind("product-1", "en", "Magnolia stem", "magnolia-stem", "ES-MAG-001", "category-1", "{}", "published", now, now)
      .run();

    await expect(
      db
        .prepare(
          "INSERT INTO products (id, locale, name, slug, product_code, category_id, specifications_json, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .bind("product-2", "en", "Magnolia stem two", "magnolia-stem-two", "ES-MAG-001", "category-1", "{}", "published", now, now)
        .run(),
    ).rejects.toThrow();

    await expect(
      db
        .prepare(
          "INSERT INTO products (id, locale, name, slug, product_code, category_id, specifications_json, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .bind("product-3", "en", "Orphan stem", "orphan-stem", "ES-ORP-001", "missing-category", "{}", "draft", now, now)
        .run(),
    ).rejects.toThrow();
  });

  it("returns a typed D1 client for the runtime binding", () => {
    expect(createDb(db as unknown as D1Database)).toHaveProperty("query");
  });

  it("seeds the English demo content idempotently", async () => {
    await applyMigration(db, "migrations/0001_initial.sql");

    await seedDemoContent(db as unknown as D1Database);
    await seedDemoContent(db as unknown as D1Database);

    await expect(rowCount(db, "categories")).resolves.toBe(5);
    await expect(rowCount(db, "products")).resolves.toBeGreaterThanOrEqual(5);
    await expect(rowCount(db, "pages")).resolves.toBeGreaterThanOrEqual(5);
    await expect(rowCount(db, "spaces")).resolves.toBeGreaterThanOrEqual(1);
    await expect(rowCount(db, "articles")).resolves.toBe(3);
    await expect(
      db.prepare("SELECT name FROM products WHERE locale = ? AND slug = ?").bind("en", "magnolia-stem").all<{ name: string }>(),
    ).resolves.toEqual({ results: [{ name: "Magnolia stem" }] });
  });
});

async function applyMigration(db: TestD1Database, path: string): Promise<void> {
  await db.exec(await readFile(path, "utf8"));
}

async function tableNames(db: TestD1Database): Promise<string[]> {
  const result = await db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
    .all<{ name: string }>();
  return result.results.map(({ name }) => name);
}

async function insertInquiry(db: TestD1Database, status: string): Promise<void> {
  const now = "2026-09-13T00:00:00.000Z";
  await db
    .prepare(
      "INSERT INTO inquiries (id, inquiry_type, name, email, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(`inquiry-${status}`, "catalog", "Ava Buyer", "ava@example.com", status, now, now)
    .run();
}

async function rowCount(db: TestD1Database, table: string): Promise<number> {
  const result = await db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).all<{ count: number }>();
  return result.results[0]?.count ?? 0;
}

class TestD1Database {
  private readonly database = new DatabaseSync(":memory:");

  prepare(query: string): TestD1PreparedStatement {
    return new TestD1PreparedStatement(this.database.prepare(query));
  }

  async exec(query: string): Promise<void> {
    this.database.exec(query);
  }

  close(): void {
    this.database.close();
  }
}

class TestD1PreparedStatement {
  private values: unknown[] = [];

  constructor(
    private readonly statement: {
      all(...values: unknown[]): unknown[];
      run(...values: unknown[]): unknown;
    },
  ) {}

  bind(...values: unknown[]): this {
    this.values = values;
    return this;
  }

  async run(): Promise<void> {
    this.statement.run(...this.values);
  }

  async all<T>(): Promise<{ results: T[] }> {
    return { results: this.statement.all(...this.values) as T[] };
  }
}
