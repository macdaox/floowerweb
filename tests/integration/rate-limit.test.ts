import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Miniflare } from "miniflare";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDb } from "../../src/lib/db/client";
import { consumeRateLimit } from "../../src/lib/http/rate-limit";

const migrationPath = resolve(import.meta.dirname, "../../migrations/0003_rate_limits.sql");
const cleanupBatchSize = 100;

describe("D1 fixed-window rate limits", () => {
  let miniflare: Miniflare;
  let database: D1Database;

  beforeEach(async () => {
    miniflare = new Miniflare({
      modules: true,
      script: "export default { fetch() { return new Response('ok'); } }",
      d1Databases: ["DB"],
    });
    database = await miniflare.getD1Database("DB") as unknown as D1Database;
    await applyMigration(database, await readFile(migrationPath, "utf8"));
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-13T00:00:00.000Z"));
  });

  afterEach(async () => {
    vi.useRealTimers();
    await miniflare.dispose();
  });

  it("atomically limits concurrent requests in a fixed window and resets after expiry", async () => {
    const db = createDb(database);

    const allowed = await Promise.all(Array.from({ length: 4 }, () => consumeRateLimit(db, "ip:form", 2, 60)));
    expect(allowed.filter(Boolean)).toHaveLength(2);

    vi.advanceTimersByTime(60_000);

    await expect(consumeRateLimit(db, "ip:form", 2, 60)).resolves.toBe(true);
    const result = await database.prepare("SELECT window_started_at, expires_at, count FROM rate_limits WHERE key = ?").bind("ip:form").first();
    expect(result).toEqual({ window_started_at: Date.now(), expires_at: Date.now() + 60_000, count: 1 });
  });

  it("removes only a bounded batch of expired counters while consuming a request", async () => {
    const expired = Array.from({ length: cleanupBatchSize + 5 }, (_, index) =>
      database.prepare("INSERT INTO rate_limits (key, window_started_at, expires_at, count) VALUES (?, ?, ?, ?)")
        .bind(`expired:${index}`, 0, 1, 1),
    );
    await database.batch(expired);

    await expect(consumeRateLimit(createDb(database), "ip:form", 1, 60)).resolves.toBe(true);

    const result = await database.prepare("SELECT COUNT(*) AS count FROM rate_limits WHERE expires_at <= 1").first<{ count: number }>();
    expect(result).toEqual({ count: 5 });
  });
});

async function applyMigration(database: D1Database, source: string): Promise<void> {
  for (const statement of source.split(";").map((entry) => entry.trim()).filter(Boolean)) {
    await database.prepare(statement).run();
  }
}
