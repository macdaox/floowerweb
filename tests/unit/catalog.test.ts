import { describe, expect, it } from "vitest";
import { getPublishedProductBySlug, listPublishedProducts } from "../../src/features/catalog/service";

type QueryRows = {
  product: Record<string, unknown> | null;
  images: Record<string, unknown>[];
  related: Record<string, unknown>[];
  cards: Record<string, unknown>[];
  total: number;
};

function d1(rows: QueryRows): D1Database {
  return {
    prepare(sql: string) {
      const statement = {
        bind: () => statement,
        first: async () => {
          if (sql.includes("COUNT(*)")) return { total: rows.total };
          return rows.product;
        },
        all: async () => ({
          results: sql.includes("FROM product_images pi\n    JOIN media") ? rows.images : sql.includes("p.id <> ?") ? rows.related : rows.cards,
        }),
      };
      return statement;
    },
  } as unknown as D1Database;
}

const rows: QueryRows = {
  product: {
    id: "product-magnolia", name: "Magnolia stem", slug: "magnolia-stem", product_code: "ES-MAG-001",
    summary: "A sculptural artificial magnolia stem.", body: "Layered petals bring quiet presence.",
    specifications_json: '{"material":"Textile","stem":"Wired"}', category_name: "Artificial flowers", category_slug: "artificial-flowers",
    seo_title: "Magnolia stem | EVERSTEM", seo_description: "Magnolia for trade.", original_filename: "everstem-magnolia-v2.jpg", alt_text: "Magnolia arrangement",
  },
  images: [{ original_filename: "detail-macro.png", alt_text: "Magnolia petal detail" }],
  related: [{ name: "Related stem", slug: "related-stem", summary: "Related product", category_name: "Artificial flowers", category_slug: "artificial-flowers", original_filename: "collection-flowers.png", alt_text: "Related stem" }],
  cards: [{ name: "Magnolia stem", slug: "magnolia-stem", summary: "A sculptural artificial magnolia stem.", category_name: "Artificial flowers", category_slug: "artificial-flowers", original_filename: "everstem-magnolia-v2.jpg", alt_text: "Magnolia arrangement" }],
  total: 1,
};

describe("catalog service", () => {
  it("returns a published product detail with a cover/gallery image and parsed specifications", async () => {
    const product = await getPublishedProductBySlug(d1(rows), "en", "magnolia-stem");

    expect(product).toMatchObject({
      name: "Magnolia stem",
      category: { slug: "artificial-flowers" },
      specifications: [{ label: "Material", value: "Textile" }, { label: "Stem", value: "Wired" }],
    });
    expect(product?.images).toEqual([
      { src: "/assets/everstem-magnolia-v2.jpg", alt: "Magnolia arrangement" },
      { src: "/assets/detail-macro.png", alt: "Magnolia petal detail" },
    ]);
    expect(product?.relatedProducts).toHaveLength(1);
    expect(product).not.toHaveProperty("price");
  });

  it("does not turn draft or missing records into public product details", async () => {
    expect(await getPublishedProductBySlug(d1({ ...rows, product: null }), "en", "draft-product")).toBeNull();
  });

  it("uses a 24-item public page contract with its total", async () => {
    const page = await listPublishedProducts(d1(rows), { locale: "en", categorySlug: "artificial-flowers", page: 2, pageSize: 999 });

    expect(page).toMatchObject({ page: 2, pageSize: 24, total: 1, totalPages: 1 });
    expect(page.items).toMatchObject([{ slug: "magnolia-stem", category: { slug: "artificial-flowers" } }]);
  });
});
