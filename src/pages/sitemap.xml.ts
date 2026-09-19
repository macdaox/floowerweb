import type { APIRoute } from "astro";
import { listPublishedCategories, listPublishedProducts, previewCatalog } from "../features/catalog/service";
import { getPublishedPage, listPublishedArticles, listPublishedSpaces, previewArticles, previewPages, previewSpaces } from "../features/content/service";
import { resolvePublicSiteOrigin } from "../features/public/site-origin";

const fixedPaths = ["/", "/collections", "/spaces", "/journal"] as const;
const editablePageKeys = ["about", "contact", "wholesale", "privacy", "terms"] as const;

export const GET: APIRoute = async ({ locals }) => {
  const origin = resolvePublicSiteOrigin(locals.runtime?.env?.PUBLIC_SITE_URL);
  const db = locals.runtime?.env?.DB;
  const paths = db ? await publishedPaths(db) : previewPaths();
  const urls = [...new Set([...fixedPaths, ...paths])].sort();
  const body = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls.map((path) => `  <url><loc>${escapeXml(new URL(path, origin).href)}</loc></url>`),
    "</urlset>",
    "",
  ].join("\n");

  return new Response(body, {
    headers: {
      "content-type": "application/xml; charset=utf-8",
      "cache-control": "public, max-age=300, stale-while-revalidate=3600",
    },
  });
};

async function publishedPaths(db: D1Database): Promise<string[]> {
  const [categories, firstProducts, spaces, articles, pages] = await Promise.all([
    listPublishedCategories(db, "en"),
    listPublishedProducts(db, { locale: "en", page: 1 }),
    listPublishedSpaces(db, "en"),
    listPublishedArticles(db, "en"),
    Promise.all(editablePageKeys.map(async (key) => ({ key, page: await getPublishedPage(db, key, "en") }))),
  ]);
  const remainingProductPages = firstProducts.totalPages > 1
    ? await Promise.all(Array.from({ length: firstProducts.totalPages - 1 }, (_, index) => listPublishedProducts(db, { locale: "en", page: index + 2 })))
    : [];
  const products = [firstProducts, ...remainingProductPages].flatMap((page) => page.items);

  return [
    ...categories.map((category) => `/collections/${encodeURIComponent(category.slug)}`),
    ...products.map((product) => `/products/${encodeURIComponent(product.slug)}`),
    ...spaces.map((space) => `/spaces/${encodeURIComponent(space.slug)}`),
    ...articles.map((article) => `/journal/${encodeURIComponent(article.slug)}`),
    ...pages.filter(({ page }) => Boolean(page)).map(({ key }) => `/${key}`),
  ];
}

function previewPaths(): string[] {
  return [
    ...previewCatalog.categories.map((category) => `/collections/${encodeURIComponent(category.slug)}`),
    ...previewCatalog.products.map((product) => `/products/${encodeURIComponent(product.slug)}`),
    ...previewSpaces.map((space) => `/spaces/${encodeURIComponent(space.slug)}`),
    ...previewArticles.map((article) => `/journal/${encodeURIComponent(article.slug)}`),
    ...editablePageKeys.filter((key) => Boolean(previewPages[key])).map((key) => `/${key}`),
  ];
}

function escapeXml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");
}
