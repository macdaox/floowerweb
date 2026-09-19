import {
  countPublishedProductRows,
  findPublishedCategoryRow,
  findPublishedProductRow,
  findPreviewCategoryRow,
  findPreviewProductRow,
  listProductImageRows,
  listPublishedCategoryRows,
  listPublishedProductRows,
  listRelatedProductRows,
} from "./repository";
import { mediaFromRow, PUBLIC_PAGE_SIZE, specificationsFromJson, text, type CatalogCategory, type Page, type ProductCard, type ProductDetail } from "./schemas";

type Row = Record<string, unknown>;

export async function listPublishedProducts(
  db: D1Database,
  { locale, categorySlug, page, pageSize }: { locale: string; categorySlug?: string; page: number; pageSize?: number },
): Promise<Page<ProductCard>> {
  const safePage = Math.max(1, Math.floor(page) || 1);
  const effectivePageSize = pageSize === PUBLIC_PAGE_SIZE ? pageSize : PUBLIC_PAGE_SIZE;
  const total = await countPublishedProductRows(db, locale, categorySlug);
  const rows = await listPublishedProductRows(db, { locale, categorySlug, limit: effectivePageSize, offset: (safePage - 1) * effectivePageSize });
  return { items: rows.map(cardFrom).filter(isCard), page: safePage, pageSize: effectivePageSize, total, totalPages: Math.max(1, Math.ceil(total / effectivePageSize)) };
}

export async function getPublishedProductBySlug(db: D1Database, locale: string, slug: string): Promise<ProductDetail | null> {
  const row = await findPublishedProductRow(db, locale, slug);
  if (!row) return null;
  const card = cardFrom(row);
  if (!isCard(card)) return null;
  const [galleryRows, relatedRows] = await Promise.all([
    listProductImageRows(db, text(row.id)),
    listRelatedProductRows(db, locale, card.category.slug, text(row.id)),
  ]);
  const cover = mediaFromRow(row);
  const galleryImages = galleryRows.map(mediaFromRow).filter((image): image is NonNullable<typeof image> => Boolean(image));
  const preferredCover = cover ? galleryImages.find((image) => image.src === cover.src) ?? cover : undefined;
  const images = [preferredCover, ...galleryImages].filter((image): image is NonNullable<typeof image> => Boolean(image));
  return {
    ...card,
    image: preferredCover,
    id: text(row.id),
    productCode: text(row.product_code),
    body: text(row.body),
    images: uniqueImages(images),
    specifications: specificationsFromJson(row.specifications_json),
    relatedProducts: relatedRows.map(cardFrom).filter(isCard),
    seo: { title: text(row.seo_title) || `${card.name} | EVERSTEM`, description: text(row.seo_description) || card.summary },
  };
}

export async function getPreviewProductById(db: D1Database, locale: string, id: string, slug: string): Promise<ProductDetail | null> {
  const row = await findPreviewProductRow(db, locale, id, slug);
  return row ? detailFromRow(db, locale, row) : null;
}

export async function listPublishedCategories(db: D1Database, locale: string): Promise<CatalogCategory[]> {
  return (await listPublishedCategoryRows(db, locale)).map(categoryFrom).filter(isCategory);
}

export async function getPublishedCategoryBySlug(db: D1Database, locale: string, slug: string): Promise<CatalogCategory | null> {
  const row = await findPublishedCategoryRow(db, locale, slug);
  const category = row ? categoryFrom(row) : undefined;
  return category && isCategory(category) ? category : null;
}

export async function getPreviewCategoryById(db: D1Database, locale: string, id: string, slug: string): Promise<CatalogCategory | null> {
  const row = await findPreviewCategoryRow(db, locale, id, slug);
  const category = row ? categoryFrom(row) : undefined;
  return category && isCategory(category) ? category : null;
}

async function detailFromRow(db: D1Database, locale: string, row: Row): Promise<ProductDetail | null> {
  const card = cardFrom(row);
  if (!isCard(card)) return null;
  const [galleryRows, relatedRows] = await Promise.all([
    listProductImageRows(db, text(row.id)),
    listRelatedProductRows(db, locale, card.category.slug, text(row.id)),
  ]);
  const cover = mediaFromRow(row);
  const galleryImages = galleryRows.map(mediaFromRow).filter((image): image is NonNullable<typeof image> => Boolean(image));
  const preferredCover = cover ? galleryImages.find((image) => image.src === cover.src) ?? cover : undefined;
  const images = [preferredCover, ...galleryImages].filter((image): image is NonNullable<typeof image> => Boolean(image));
  return {
    ...card, image: preferredCover,
    id: text(row.id), productCode: text(row.product_code), body: text(row.body), images: uniqueImages(images),
    specifications: specificationsFromJson(row.specifications_json), relatedProducts: relatedRows.map(cardFrom).filter(isCard),
    seo: { title: text(row.seo_title) || `${card.name} | EVERSTEM`, description: text(row.seo_description) || card.summary },
  };
}

/** Demo content is used only by the local public shell when a D1 binding is unavailable. */
export const previewCatalog = {
  categories: [
    { name: "Artificial flowers", slug: "artificial-flowers", description: "Single stems and arrangements with natural rhythm.", image: { src: "/assets/everstem-magnolia-v2.jpg", alt: "Artificial magnolia flowers arranged in a stone vessel" } },
    { name: "Artificial branches", slug: "artificial-branches", description: "Flowering and foliage branches composed as architectural objects.", image: { src: "/assets/collection-branches.png", alt: "Delicate flowering branch displayed as an architectural object" } },
    { name: "Artificial plants", slug: "artificial-plants", description: "Potted botanical forms for contemporary interiors.", image: { src: "/assets/collection-flowers.png", alt: "Artificial plant composition with textile flowers and leaves" } },
    { name: "Artificial trees", slug: "artificial-trees", description: "Floor-standing statement trees for permanent installations.", image: { src: "/assets/hero-tree.png", alt: "Large artificial tree in a contemporary interior" } },
    { name: "Botanical installations", slug: "botanical-installations", description: "Custom commercial displays shaped by architecture, light and movement.", image: { src: "/assets/spaces-residential.png", alt: "Botanical installation shaping a contemporary commercial interior" } },
  ] satisfies CatalogCategory[],
  products: [
    { name: "Magnolia stem", slug: "magnolia-stem", summary: "A sculptural artificial magnolia stem with layered textile petals.", category: { name: "Artificial flowers", slug: "artificial-flowers" }, image: { src: "/assets/everstem-magnolia-v2.jpg", alt: "Artificial magnolia flowers arranged in a stone vessel" } },
    { name: "Flowering branch", slug: "flowering-branch", summary: "A delicate flowering branch with a naturally irregular silhouette.", category: { name: "Artificial branches", slug: "artificial-branches" }, image: { src: "/assets/collection-branches.png", alt: "Delicate flowering branch displayed as an architectural object" } },
    { name: "Potted botanical composition", slug: "potted-botanical-composition", summary: "A textile-flower and foliage composition for indoor display.", category: { name: "Artificial plants", slug: "artificial-plants" }, image: { src: "/assets/collection-flowers.png", alt: "Artificial plant composition with textile flowers and leaves" } },
    { name: "Statement tree", slug: "statement-tree", summary: "A floor-standing artificial tree for contemporary commercial interiors.", category: { name: "Artificial trees", slug: "artificial-trees" }, image: { src: "/assets/hero-tree.png", alt: "Large artificial tree in a contemporary interior" } },
    { name: "Hospitality botanical installation", slug: "hospitality-botanical-installation", summary: "A custom installation of artificial flowers and branches for hospitality spaces.", category: { name: "Botanical installations", slug: "botanical-installations" }, image: { src: "/assets/trade-installation.png", alt: "Artificial flower and branch installation in a refined hospitality interior" } },
  ] satisfies ProductCard[],
};

export function previewProduct(slug: string): ProductDetail | null {
  const product = previewCatalog.products.find((candidate) => candidate.slug === slug);
  if (!product) return null;
  const images = product.image ? [product.image, { src: "/assets/detail-macro.png", alt: `${product.name} material detail` }] : [];
  return {
    ...product, id: `preview-${product.slug}`, productCode: "Available on request", body: product.summary,
    images, specifications: [{ label: "Material", value: "Textile and molded resin" }, { label: "Use", value: "Trade collection or project supply" }],
    relatedProducts: previewCatalog.products.filter((candidate) => candidate.category.slug === product.category.slug && candidate.slug !== product.slug),
    seo: { title: `${product.name} | EVERSTEM`, description: product.summary },
  };
}

function cardFrom(row: Row): ProductCard {
  return {
    name: text(row.name), slug: text(row.slug), summary: text(row.summary),
    category: { name: text(row.category_name), slug: text(row.category_slug) }, image: mediaFromRow(row),
  };
}

function categoryFrom(row: Row): CatalogCategory {
  return { name: text(row.name), slug: text(row.slug), description: text(row.description), image: mediaFromRow(row) };
}

function isCard(card: ProductCard): boolean { return Boolean(card.name && card.slug && card.category.name && card.category.slug); }
function isCategory(category: CatalogCategory): boolean { return Boolean(category.name && category.slug); }
function uniqueImages(images: NonNullable<ProductDetail["images"][number]>[]): ProductDetail["images"] {
  return images.filter((image, index) => images.findIndex((candidate) => candidate.src === image.src) === index);
}
