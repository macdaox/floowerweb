import { parseStoredPageBlocks } from "../content/schemas";
import { publicMediaUrl } from "../media/schemas";

export interface HomeMedia { src: string; alt: string; }
export interface HomeCategory { name: string; slug: string; description: string; image?: HomeMedia; }
export interface HomeProduct { name: string; slug: string; summary: string; categorySlug: string; }
export interface HomeSpace { title: string; slug: string; category: string; summary: string; image?: HomeMedia; }
export interface HomeArticle { title: string; slug: string; category: string; readTime: string; image?: HomeMedia; }
export interface HomeContent {
  seo: { title: string; description: string };
  hero?: { eyebrow: string; title: string; image?: HomeMedia };
  categories: HomeCategory[]; products: HomeProduct[]; space?: HomeSpace; articles: HomeArticle[];
  settings: { companyName: string; tagline: string; instagramUrl?: string; pinterestUrl?: string; linkedinUrl?: string };
}

type Row = Record<string, unknown>;
type Read<T> = { failed: false; value: T } | { failed: true };
type ParsedHero = { eyebrow: string; title: string; image?: HomeMedia };
const asset = (filename: string) => `/assets/${filename}`;
const media = (filename: string, alt: string): HomeMedia => ({ src: asset(filename), alt });

export async function loadHomeContent(binding?: D1Database): Promise<HomeContent> {
  if (!binding) return fallbackHomeContent;
  const [pageRead, categoriesRead, productsRead, spaceRead, articlesRead, settingsRead] = await Promise.all([
    safely(() => binding.prepare("SELECT sections_json, seo_title, seo_description FROM pages WHERE page_key = 'home' AND locale = 'en' AND status = 'published' LIMIT 1").first<Row>()),
    safely(() => binding.prepare(`SELECT c.name, c.slug, c.description, m.object_key, m.original_filename, m.alt_text FROM categories c LEFT JOIN media m ON m.id = c.cover_media_id WHERE c.locale = 'en' AND c.status = 'published' ORDER BY c.sort_order, c.name`).all<Row>()),
    safely(() => binding.prepare(`SELECT p.name, p.slug, p.summary, c.slug AS category_slug FROM products p JOIN categories c ON c.id = p.category_id WHERE p.locale = 'en' AND p.status = 'published' ORDER BY c.sort_order, p.name`).all<Row>()),
    safely(() => binding.prepare(`SELECT s.title, s.slug, s.category, s.summary, m.object_key, m.original_filename, m.alt_text FROM spaces s LEFT JOIN media m ON m.id = s.cover_media_id WHERE s.locale = 'en' AND s.status = 'published' ORDER BY s.updated_at DESC LIMIT 1`).first<Row>()),
    safely(() => binding.prepare(`SELECT a.title, a.slug, m.object_key, m.original_filename, m.alt_text FROM articles a LEFT JOIN media m ON m.id = a.cover_media_id WHERE a.locale = 'en' AND a.status = 'published' ORDER BY a.published_at DESC LIMIT 3`).all<Row>()),
    safely(() => binding.prepare("SELECT company_name, tagline, instagram_url, pinterest_url, linkedin_url, default_seo_title, default_seo_description FROM settings WHERE id = 'site' LIMIT 1").first<Row>()),
  ]);
  const page = pageRead.failed ? undefined : pageRead.value;
  const parsedHero: ParsedHero | undefined = pageRead.failed && fallbackHomeContent.hero
    ? { eyebrow: fallbackHomeContent.hero.eyebrow, title: fallbackHomeContent.hero.title }
    : parseHero(page?.sections_json);
  const heroImage = pageRead.failed ? fallbackHomeContent.hero?.image : parsedHero?.image;
  return {
    seo: pageRead.failed ? fallbackHomeContent.seo : { title: text(page?.seo_title) || text(settingsRead.failed ? undefined : settingsRead.value?.default_seo_title) || "EVERSTEM", description: text(page?.seo_description) || text(settingsRead.failed ? undefined : settingsRead.value?.default_seo_description) || "" },
    hero: parsedHero && { eyebrow: parsedHero.eyebrow, title: parsedHero.title, image: heroImage },
    categories: categoriesRead.failed ? fallbackHomeContent.categories : categoriesRead.value.results.map(categoryFrom).filter(isCategory),
    products: productsRead.failed ? fallbackHomeContent.products : productsRead.value.results.map(productFrom).filter(isProduct),
    space: spaceRead.failed ? fallbackHomeContent.space : spaceFrom(spaceRead.value),
    articles: articlesRead.failed ? fallbackHomeContent.articles : articlesRead.value.results.map(articleFrom).filter(isArticle),
    settings: settingsRead.failed ? fallbackHomeContent.settings : settingsFrom(settingsRead.value),
  };
}

async function safely<T>(read: () => Promise<T>): Promise<Read<T>> { try { return { failed: false, value: await read() }; } catch { return { failed: true }; } }
function parseHero(value: unknown): ParsedHero | undefined {
  const section = parseStoredPageBlocks(value)?.find((item) => item.type === "hero");
  if (!section || !section.eyebrow) return undefined;
  return { eyebrow: section.eyebrow, title: section.title, image: section.image };
}
function categoryFrom(row: Row): HomeCategory { return { name: text(row.name), slug: text(row.slug), description: text(row.description), image: rowMedia(row) }; }
function productFrom(row: Row): HomeProduct { return { name: text(row.name), slug: text(row.slug), summary: text(row.summary), categorySlug: text(row.category_slug) }; }
function spaceFrom(row: Row | null): HomeSpace | undefined { if (!row) return undefined; const space = { title: text(row.title), slug: text(row.slug), category: text(row.category), summary: text(row.summary), image: rowMedia(row) }; return space.title && space.slug ? space : undefined; }
function articleFrom(row: Row, index: number): HomeArticle { return { title: text(row.title), slug: text(row.slug), category: ["Material development", "Display design", "Commercial space"][index] ?? "Journal", readTime: ["4 min", "7 min", "5 min"][index] ?? "5 min", image: rowMedia(row) }; }
function settingsFrom(row: Row | null): HomeContent["settings"] { return { companyName: text(row?.company_name), tagline: text(row?.tagline), instagramUrl: optionalText(row?.instagram_url), pinterestUrl: optionalText(row?.pinterest_url), linkedinUrl: optionalText(row?.linkedin_url) }; }
function rowMedia(row: Row | null): HomeMedia | undefined { const src = row ? publicMediaUrl(row) : undefined; return src ? { src, alt: text(row?.alt_text) || "EVERSTEM botanical object" } : undefined; }
function isCategory(category: HomeCategory): boolean { return Boolean(category.name && category.slug); }
function isProduct(product: HomeProduct): boolean { return Boolean(product.name && product.slug && product.categorySlug); }
function isArticle(article: HomeArticle): boolean { return Boolean(article.title && article.slug); }
function text(value: unknown): string { return typeof value === "string" ? value : ""; }
function optionalText(value: unknown): string | undefined { const result = text(value); return result || undefined; }

const fallbackHomeContent: HomeContent = {
  seo: { title: "EVERSTEM | Artificial Flowers and Botanical Objects", description: "Artificial flowers, plants and trees for wholesale buyers worldwide." },
  hero: { eyebrow: "Artificial Flowers & Plants for Wholesale", title: "Nature, reimagined.", image: media("everstem-hero-magnolia-v3.png", "Sculptural artificial magnolia arrangement in a refined commercial lobby") },
  categories: [
    { name: "Artificial flowers", slug: "artificial-flowers", description: "Single stems and arrangements with natural rhythm.", image: media("everstem-magnolia-v2.jpg", "Artificial magnolia flowers arranged in a stone vessel") },
    { name: "Artificial branches", slug: "artificial-branches", description: "Flowering and foliage branches composed as architectural objects.", image: media("collection-branches.png", "Delicate flowering branch displayed as an architectural object") },
    { name: "Artificial plants", slug: "artificial-plants", description: "Potted botanical forms for contemporary interiors.", image: media("collection-flowers.png", "Artificial plant composition with textile flowers and leaves") },
    { name: "Artificial trees", slug: "artificial-trees", description: "Floor-standing statement trees for permanent installations.", image: media("hero-tree.png", "Large artificial tree in a contemporary interior") },
    { name: "Botanical installations", slug: "botanical-installations", description: "Custom commercial displays shaped by architecture, light and movement.", image: media("spaces-residential.png", "Botanical installation shaping a contemporary commercial interior") },
  ],
  products: [
    { name: "Magnolia stem", slug: "magnolia-stem", summary: "A sculptural artificial magnolia stem with layered textile petals.", categorySlug: "artificial-flowers" },
    { name: "Flowering branch", slug: "flowering-branch", summary: "A delicate flowering branch with a naturally irregular silhouette.", categorySlug: "artificial-branches" },
    { name: "Potted botanical composition", slug: "potted-botanical-composition", summary: "A textile-flower and foliage composition for indoor display.", categorySlug: "artificial-plants" },
    { name: "Statement tree", slug: "statement-tree", summary: "A floor-standing artificial tree for contemporary commercial interiors.", categorySlug: "artificial-trees" },
    { name: "Hospitality botanical installation", slug: "hospitality-botanical-installation", summary: "A custom installation of artificial flowers and branches for hospitality spaces.", categorySlug: "botanical-installations" },
  ],
  space: { title: "Hospitality botanicals in context", slug: "hospitality-botanicals", category: "Hospitality", summary: "Botanical scale composed with architecture, light and movement.", image: media("trade-installation.png", "Artificial flower and branch installation in a refined hospitality interior") },
  articles: [
    { title: "Material and color development", slug: "material-and-color-development", category: "Material development", readTime: "4 min", image: media("detail-macro.png", "Leaf, stone and textile material study") },
    { title: "Choosing flowers for long-term displays", slug: "choosing-flowers-for-long-term-displays", category: "Display design", readTime: "7 min", image: media("everstem-journal-v2.jpg", "Artificial flowering branch arranged with stone and linen") },
    { title: "How artificial botanicals shape commercial space", slug: "how-artificial-botanicals-shape-commercial-space", category: "Commercial space", readTime: "5 min", image: media("journal-imperfection.png", "Sculptural branch on a raw limestone pedestal") },
  ],
  settings: { companyName: "EVERSTEM", tagline: "Botanical objects for contemporary spaces." },
};
