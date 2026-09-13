import { describe, expect, it } from "vitest";
import { loadHomeContent } from "../../src/features/public/home";

type Rows = {
  page: Record<string, unknown> | null;
  categories: Record<string, unknown>[];
  products: Record<string, unknown>[];
  space: Record<string, unknown> | null;
  articles: Record<string, unknown>[];
  settings: Record<string, unknown> | null;
};

function d1(rows: Rows): D1Database {
  return {
    prepare(sql: string) {
      const first = async () => {
        if (sql.includes("FROM pages")) return rows.page;
        if (sql.includes("FROM spaces")) return rows.space;
        if (sql.includes("FROM settings")) return rows.settings;
        return null;
      };
      return {
        first,
        all: async () => ({ results: sql.includes("FROM categories") ? rows.categories : sql.includes("FROM products") ? rows.products : rows.articles }),
        bind: () => ({ first }),
      };
    },
  } as unknown as D1Database;
}

const partialRows: Rows = {
  page: {
    sections_json: JSON.stringify([{ type: "hero", eyebrow: "Edited wholesale botanicals", title: "A changed hero.", image: { src: "/assets/custom-hero.png", alt: "An editor-selected hero image" } }]),
    seo_title: "Edited home", seo_description: "Edited home description",
  },
  categories: [
    { name: "Published one", slug: "published-one", description: "One", original_filename: "one.png", alt_text: "One" },
    { name: "Published two", slug: "published-two", description: "Two", original_filename: "two.png", alt_text: "Two" },
    { name: "Published three", slug: "published-three", description: "Three", original_filename: "three.png", alt_text: "Three" },
    { name: "Published four", slug: "published-four", description: "Four", original_filename: "four.png", alt_text: "Four" },
  ],
  products: [],
  space: null,
  articles: [{ title: "Only published article", slug: "only-published-article", original_filename: "article.png", alt_text: "Article" }],
  settings: { company_name: "Edited EVERSTEM", tagline: "Edited tagline" },
};

describe("loadHomeContent", () => {
  it("keeps successful partial D1 content authoritative and uses the validated page hero image", async () => {
    const content = await loadHomeContent(d1(partialRows));

    expect(content.hero).toMatchObject({ eyebrow: "Edited wholesale botanicals", title: "A changed hero.", image: { src: "/assets/custom-hero.png", alt: "An editor-selected hero image" } });
    expect(content.categories.map((category) => category.name)).toEqual(["Published one", "Published two", "Published three", "Published four"]);
    expect(content.products).toEqual([]);
    expect(content.articles.map((article) => article.title)).toEqual(["Only published article"]);
    expect(content.space).toBeUndefined();
    expect(content.settings.companyName).toBe("Edited EVERSTEM");
  });

  it("degrades an invalid page hero image instead of restoring a seeded image", async () => {
    const content = await loadHomeContent(d1({
      ...partialRows,
      page: { ...partialRows.page!, sections_json: JSON.stringify([{ type: "hero", eyebrow: "Edited", title: "No image", image: 42 }]) },
    }));

    expect(content.hero?.image).toBeUndefined();
    expect(content.categories).toHaveLength(4);
  });
});
