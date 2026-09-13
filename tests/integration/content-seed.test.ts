import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Miniflare } from "miniflare";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { seedDemoContent } from "../../scripts/seed";
import { getPublishedPage } from "../../src/features/content/service";
import { writePage } from "../../src/features/content/write";
import { loadHomeContent } from "../../src/features/public/home";

const workspace = resolve(import.meta.dirname, "../..");

describe("seeded public content", () => {
  let miniflare: Miniflare;
  let database: D1Database;

  beforeEach(async () => {
    miniflare = new Miniflare({ modules: true, script: "export default { fetch() { return new Response('ok'); } }", d1Databases: ["DB"] });
    database = await miniflare.getD1Database("DB") as unknown as D1Database;
    for (const name of ["0001_initial.sql", "0002_schema_normalization.sql", "0003_rate_limits.sql"]) {
      await applyMigration(database, await readFile(resolve(workspace, "migrations", name), "utf8"));
    }
    await seedDemoContent(database);
  });

  afterEach(async () => { await miniflare.dispose(); });

  it("loads seeded home, company, and legal pages with renderable supported blocks", async () => {
    const [home, about, contact, wholesale, privacy, terms] = await Promise.all([
      loadHomeContent(database),
      getPublishedPage(database, "about", "en"),
      getPublishedPage(database, "contact", "en"),
      getPublishedPage(database, "wholesale", "en"),
      getPublishedPage(database, "privacy", "en"),
      getPublishedPage(database, "terms", "en"),
    ]);

    expect(home.hero).toMatchObject({ title: "Nature, reimagined.", image: { src: "/assets/everstem-hero-magnolia-v3.png" } });
    expect(about?.sections).toEqual(expect.arrayContaining([expect.objectContaining({ type: "hero", title: expect.stringMatching(/crafted/i) })]));
    expect(contact?.sections).toEqual(expect.arrayContaining([expect.objectContaining({ type: "contactDetails", email: expect.stringContaining("@") })]));
    expect(wholesale?.sections).toEqual(expect.arrayContaining([expect.objectContaining({ type: "capabilities", items: expect.arrayContaining(["Private label"]) })]));
    expect(privacy?.sections).toEqual(expect.arrayContaining([expect.objectContaining({ type: "richText" })]));
    expect(terms?.sections).toEqual(expect.arrayContaining([expect.objectContaining({ type: "richText" })]));
  });

  it("rejects an unknown block before the active page writer persists it", async () => {
    await expect(writePage(database, {
      id: "invalid-page", key: "invalid", locale: "en", status: "draft", sections: [{ type: "story", title: "Obsolete" }],
      seoTitle: "Invalid", seoDescription: "Invalid", createdAt: "2026-09-13T00:00:00.000Z", updatedAt: "2026-09-13T00:00:00.000Z",
    })).rejects.toThrow(/unknown page block type/i);
    expect(await database.prepare("SELECT COUNT(*) AS total FROM pages WHERE id = ?").bind("invalid-page").first<{ total: number }>()).toEqual({ total: 0 });
  });
});

async function applyMigration(database: D1Database, source: string): Promise<void> {
  for (const statement of source.split(";").map((entry) => entry.trim()).filter(Boolean)) await database.prepare(statement).run();
}
