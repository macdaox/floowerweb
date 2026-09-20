import { parseStoredPageBlocks, type PageBlock } from "../content/schemas";
import { publicMediaUrl } from "../media/schemas";

export interface HomeMedia { src: string; alt: string; width?: number; height?: number; }
export interface HomeCategory { name: string; slug: string; description: string; image?: HomeMedia; }
export interface HomeProduct { name: string; slug: string; summary: string; categorySlug: string; }
export interface HomeSpace { title: string; slug: string; category: string; summary: string; image?: HomeMedia; }
export interface HomeArticle { title: string; slug: string; category: string; readTime: string; image?: HomeMedia; }
export interface HomeContent {
  seo: { title: string; description: string };
  hero?: { eyebrow: string; title: string; image?: HomeMedia };
  sections: PageBlock[];
  categories: HomeCategory[]; products: HomeProduct[]; space?: HomeSpace; articles: HomeArticle[];
}

type Row = Record<string, unknown>;
type Read<T> = { failed: false; value: T } | { failed: true };
type ParsedHero = { eyebrow: string; title: string; image?: HomeMedia };
const asset = (filename: string) => `/assets/${filename}`;
const media = (filename: string, alt: string): HomeMedia => ({ src: asset(filename), alt });

export async function loadHomeContent(binding?: D1Database): Promise<HomeContent> {
  if (!binding) return fallbackHomeContent;
  const [pageRead, categoriesRead, productsRead, spaceRead, articlesRead] = await Promise.all([
    safely(() => binding.prepare("SELECT sections_json, seo_title, seo_description FROM pages WHERE page_key = 'home' AND locale = 'en' AND status = 'published' LIMIT 1").first<Row>()),
    safely(() => binding.prepare(`SELECT c.name, c.slug, c.description, m.object_key, m.original_filename, m.width, m.height, m.alt_text FROM categories c LEFT JOIN media m ON m.id = c.cover_media_id WHERE c.locale = 'en' AND c.status = 'published' ORDER BY c.sort_order, c.name`).all<Row>()),
    safely(() => binding.prepare(`SELECT p.name, p.slug, p.summary, c.slug AS category_slug FROM products p JOIN categories c ON c.id = p.category_id WHERE p.locale = 'en' AND p.status = 'published' ORDER BY c.sort_order, p.name`).all<Row>()),
    safely(() => binding.prepare(`SELECT s.title, s.slug, s.category, s.summary, m.object_key, m.original_filename, m.width, m.height, m.alt_text FROM spaces s LEFT JOIN media m ON m.id = s.cover_media_id WHERE s.locale = 'en' AND s.status = 'published' ORDER BY s.updated_at DESC LIMIT 1`).first<Row>()),
    safely(() => binding.prepare(`SELECT a.title, a.slug, a.author, a.summary, a.body, m.object_key, m.original_filename, m.width, m.height, m.alt_text FROM articles a LEFT JOIN media m ON m.id = a.cover_media_id WHERE a.locale = 'en' AND a.status = 'published' ORDER BY a.published_at DESC LIMIT 3`).all<Row>()),
  ]);
  const page = pageRead.failed ? undefined : pageRead.value;
  const parsedSections = pageRead.failed ? fallbackHomeContent.sectionsWithHero : parseStoredPageBlocks(page?.sections_json) ?? [];
  const parsedHero: ParsedHero | undefined = pageRead.failed && fallbackHomeContent.hero
    ? { eyebrow: fallbackHomeContent.hero.eyebrow, title: fallbackHomeContent.hero.title }
    : parseHero(parsedSections);
  const heroImage = pageRead.failed ? fallbackHomeContent.hero?.image : parsedHero?.image;
  return {
    seo: pageRead.failed ? fallbackHomeContent.seo : { title: text(page?.seo_title), description: text(page?.seo_description) },
    hero: parsedHero && { eyebrow: parsedHero.eyebrow, title: parsedHero.title, image: heroImage },
    sections: parsedSections.filter((section) => section.type !== "hero"),
    categories: categoriesRead.failed ? fallbackHomeContent.categories : categoriesRead.value.results.map(categoryFrom).filter(isCategory),
    products: productsRead.failed ? fallbackHomeContent.products : productsRead.value.results.map(productFrom).filter(isProduct),
    space: spaceRead.failed ? fallbackHomeContent.space : spaceFrom(spaceRead.value),
    articles: articlesRead.failed ? fallbackHomeContent.articles : articlesRead.value.results.map(articleFrom).filter(isArticle),
  };
}

async function safely<T>(read: () => Promise<T>): Promise<Read<T>> { try { return { failed: false, value: await read() }; } catch { return { failed: true }; } }
function parseHero(sections: PageBlock[]): ParsedHero | undefined {
  const section = sections.find((item) => item.type === "hero");
  if (!section || !section.eyebrow) return undefined;
  return { eyebrow: section.eyebrow, title: section.title, image: section.image };
}
function categoryFrom(row: Row): HomeCategory { return { name: text(row.name), slug: text(row.slug), description: text(row.description), image: rowMedia(row) }; }
function productFrom(row: Row): HomeProduct { return { name: text(row.name), slug: text(row.slug), summary: text(row.summary), categorySlug: text(row.category_slug) }; }
function spaceFrom(row: Row | null): HomeSpace | undefined { if (!row) return undefined; const space = { title: text(row.title), slug: text(row.slug), category: text(row.category), summary: text(row.summary), image: rowMedia(row) }; return space.title && space.slug ? space : undefined; }
function articleFrom(row: Row): HomeArticle {
  const wordCount = `${text(row.summary)} ${text(row.body)}`.trim().split(/\s+/u).filter(Boolean).length;
  return { title: text(row.title), slug: text(row.slug), category: text(row.author) || "EVERSTEM Journal", readTime: `${Math.max(1, Math.ceil(wordCount / 200))} min`, image: rowMedia(row) };
}
function rowMedia(row: Row | null): HomeMedia | undefined {
  const src = row ? publicMediaUrl(row) : undefined;
  if (!src) return undefined;
  const width = dimension(row?.width);
  const height = dimension(row?.height);
  return { src, alt: text(row?.alt_text) || "EVERSTEM botanical object", ...(width && height ? { width, height } : {}) };
}
function isCategory(category: HomeCategory): boolean { return Boolean(category.name && category.slug); }
function isProduct(product: HomeProduct): boolean { return Boolean(product.name && product.slug && product.categorySlug); }
function isArticle(article: HomeArticle): boolean { return Boolean(article.title && article.slug); }
function text(value: unknown): string { return typeof value === "string" ? value : ""; }
function dimension(value: unknown): number | undefined { const parsed = typeof value === "number" ? value : Number(value); return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined; }

const fallbackSections: PageBlock[] = [
  { type: "hero", eyebrow: "Artificial Flowers & Plants for Wholesale", title: "Nature, reimagined.", image: media("everstem-hero-magnolia-v3.png", "Sculptural artificial magnolia arrangement in a refined commercial lobby") },
  { type: "richText", heading: "Our approach", document: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "We create botanical forms that bring the quiet presence of nature into contemporary spaces." }] }] } },
  { type: "imageText", eyebrow: "The detail", title: "The detail matters.", body: "From the texture of a leaf to the structure of a stem, every detail is considered.", image: media("everstem-detail-v2.jpg", "Macro view of textile petals, molded leaf veins and a wrapped stem") },
  { type: "capabilities", eyebrow: "Crafted with intention", title: "Crafted in China. Designed for the world.", items: ["Material development", "Color matching", "Hand assembly", "Private label", "Export packaging", "Quality control"] },
  { type: "cta", eyebrow: "For trade", title: "Partner with EVERSTEM.", body: "Source artificial flowers and botanicals for wholesale collections, private label and commercial projects.", label: "Request catalog", href: "/wholesale#catalog-form" },
];

const fallbackHomeContent: HomeContent & { sectionsWithHero: PageBlock[] } = {
  seo: { title: "EVERSTEM | Artificial Flowers and Botanical Objects", description: "Artificial flowers, plants and trees for wholesale buyers worldwide." },
  hero: { eyebrow: "Artificial Flowers & Plants for Wholesale", title: "Nature, reimagined.", image: media("everstem-hero-magnolia-v3.png", "Sculptural artificial magnolia arrangement in a refined commercial lobby") },
  sections: fallbackSections.slice(1),
  sectionsWithHero: fallbackSections,
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
};
