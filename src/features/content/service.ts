import {
  findPublishedArticleRow,
  findPublishedPageRow,
  findPublishedSpaceRow,
  findPreviewArticleRow,
  findPreviewPageByIdRow,
  findPreviewPageRow,
  findPreviewSpaceRow,
  listPublishedArticleRows,
  listPublishedSpaceRows,
  listRelatedArticleRows,
  listRelatedSpaceRows,
  listSpaceImageRows,
} from "./repository";
import { contentImageFromRow, parseStoredPageBlocks, text, type ArticleCard, type ArticleDetail, type ContentPage, type ContentImage, type SpaceCard, type SpaceDetail } from "./schemas";

type Row = Record<string, unknown>;

export async function getPublishedPage(db: D1Database, key: string, locale: string): Promise<ContentPage | null> {
  const row = await findPublishedPageRow(db, key, locale);
  if (!row) return null;
  const sections = parseStoredPageBlocks(row.sections_json);
  if (!sections) return null;
  return { key: text(row.page_key), sections, seo: { title: text(row.seo_title) || `${titleFor(key)} | EVERSTEM`, description: text(row.seo_description) || descriptionFor(key) } };
}

export async function getPreviewPageById(db: D1Database, id: string, key: string, locale: string): Promise<ContentPage | null> {
  const row = await findPreviewPageRow(db, id, key, locale);
  if (!row) return null;
  const sections = parseStoredPageBlocks(row.sections_json);
  return sections ? { key: text(row.page_key), sections, seo: { title: text(row.seo_title) || `${titleFor(key)} | EVERSTEM`, description: text(row.seo_description) || descriptionFor(key) } } : null;
}

export async function getPreviewPage(db: D1Database, id: string, locale: string): Promise<ContentPage | null> {
  const row = await findPreviewPageByIdRow(db, id, locale);
  if (!row) return null;
  const key = text(row.page_key);
  const sections = parseStoredPageBlocks(row.sections_json);
  return sections ? { key, sections, seo: { title: text(row.seo_title) || `${titleFor(key)} | EVERSTEM`, description: text(row.seo_description) || descriptionFor(key) } } : null;
}

export async function listPublishedSpaces(db: D1Database, locale: string): Promise<SpaceCard[]> {
  return (await listPublishedSpaceRows(db, locale)).map(spaceCardFrom).filter(isSpaceCard);
}

export async function getPublishedSpace(db: D1Database, locale: string, slug: string): Promise<SpaceDetail | null> {
  const row = await findPublishedSpaceRow(db, locale, slug);
  if (!row) return null;
  const card = spaceCardFrom(row);
  if (!isSpaceCard(card)) return null;
  const [images, related] = await Promise.all([listSpaceImageRows(db, text(row.id)), listRelatedSpaceRows(db, locale, card.category, text(row.id))]);
  const galleryImages = images.map(contentImageFromRow).filter((image): image is ContentImage => Boolean(image));
  const preferredCover = card.image ? galleryImages.find((image) => image.src === card.image?.src) ?? card.image : undefined;
  return {
    ...card, image: preferredCover,
    id: text(row.id), body: text(row.body),
    images: uniqueImages([preferredCover, ...galleryImages]),
    relatedSpaces: related.map(spaceCardFrom).filter(isSpaceCard),
    seo: { title: text(row.seo_title) || `${card.title} | EVERSTEM`, description: text(row.seo_description) || card.summary },
  };
}

export async function getPreviewSpaceById(db: D1Database, locale: string, id: string, slug: string): Promise<SpaceDetail | null> {
  const row = await findPreviewSpaceRow(db, locale, id, slug);
  return row ? spaceDetailFromRow(db, locale, row) : null;
}

export const getPublishedSpaceBySlug = getPublishedSpace;

export async function listPublishedArticles(db: D1Database, locale: string): Promise<ArticleCard[]> {
  return (await listPublishedArticleRows(db, locale)).map(articleCardFrom).filter(isArticleCard);
}

export async function getPublishedArticle(db: D1Database, locale: string, slug: string): Promise<ArticleDetail | null> {
  const row = await findPublishedArticleRow(db, locale, slug);
  if (!row) return null;
  const card = articleCardFrom(row);
  if (!isArticleCard(card)) return null;
  const related = await listRelatedArticleRows(db, locale, text(row.id));
  return { ...card, id: text(row.id), body: text(row.body), relatedArticles: related.map(articleCardFrom).filter(isArticleCard), seo: { title: text(row.seo_title) || `${card.title} | EVERSTEM`, description: text(row.seo_description) || card.summary } };
}

export async function getPreviewArticleById(db: D1Database, locale: string, id: string, slug: string): Promise<ArticleDetail | null> {
  const row = await findPreviewArticleRow(db, locale, id, slug);
  return row ? articleDetailFromRow(db, locale, row) : null;
}

async function spaceDetailFromRow(db: D1Database, locale: string, row: Row): Promise<SpaceDetail | null> {
  const card = spaceCardFrom(row);
  if (!isSpaceCard(card)) return null;
  const [images, related] = await Promise.all([listSpaceImageRows(db, text(row.id)), listRelatedSpaceRows(db, locale, card.category, text(row.id))]);
  const galleryImages = images.map(contentImageFromRow).filter((image): image is ContentImage => Boolean(image));
  const preferredCover = card.image ? galleryImages.find((image) => image.src === card.image?.src) ?? card.image : undefined;
  return { ...card, image: preferredCover, id: text(row.id), body: text(row.body), images: uniqueImages([preferredCover, ...galleryImages]), relatedSpaces: related.map(spaceCardFrom).filter(isSpaceCard), seo: { title: text(row.seo_title) || `${card.title} | EVERSTEM`, description: text(row.seo_description) || card.summary } };
}

async function articleDetailFromRow(db: D1Database, locale: string, row: Row): Promise<ArticleDetail | null> {
  const card = articleCardFrom(row);
  if (!isArticleCard(card)) return null;
  const related = await listRelatedArticleRows(db, locale, text(row.id));
  return { ...card, id: text(row.id), body: text(row.body), relatedArticles: related.map(articleCardFrom).filter(isArticleCard), seo: { title: text(row.seo_title) || `${card.title} | EVERSTEM`, description: text(row.seo_description) || card.summary } };
}

export const getPublishedArticleBySlug = getPublishedArticle;

const previewImages = {
  spaces: { src: "/assets/everstem-spaces-v2.jpg", alt: "Artificial botanical installation in a contemporary hospitality interior" },
  residential: { src: "/assets/spaces-residential.png", alt: "Sculptural artificial botanical composition in a residential space" },
  journal: { src: "/assets/everstem-journal-v2.jpg", alt: "Flowering artificial branch arranged with stone and linen" },
  material: { src: "/assets/detail-macro.png", alt: "Leaf, stone and textile material study" },
  imperfection: { src: "/assets/journal-imperfection.png", alt: "Sculptural branch on a limestone pedestal" },
} satisfies Record<string, ContentImage>;

export const previewSpaces: SpaceCard[] = [
  { title: "Botanicals for a hospitality arrival", slug: "hospitality-botanicals", category: "Hospitality", location: "Guangzhou", summary: "A durable floral focal point that gives a calm welcome to a high-traffic lobby.", image: previewImages.spaces },
  { title: "A quiet residential composition", slug: "quiet-residential-composition", category: "Residential", location: "Shanghai", summary: "Layered stems, flowering branches and foliage composed as a long-lasting domestic object.", image: previewImages.residential },
];

export const previewArticles: ArticleCard[] = [
  { title: "Material and color development", slug: "material-and-color-development", summary: "How tonal variation, surface texture and proportion make artificial botanicals feel observed rather than repeated.", author: "EVERSTEM Studio", publishedAt: "2026-05-12", image: previewImages.material },
  { title: "Choosing flowers for long-term displays", slug: "choosing-flowers-for-long-term-displays", summary: "A practical guide to scale, silhouette and maintenance for commercial floral installations.", author: "EVERSTEM Studio", publishedAt: "2026-04-28", image: previewImages.journal },
  { title: "The value of imperfection", slug: "the-value-of-imperfection", summary: "Why natural irregularity is essential to botanical objects made for permanent spaces.", author: "EVERSTEM Studio", publishedAt: "2026-03-18", image: previewImages.imperfection },
];

export const previewPages: Record<string, ContentPage> = {
  about: page("about", "About EVERSTEM", "The people, materials and considered process behind EVERSTEM botanical objects.", [
    { type: "hero", eyebrow: "Our studio", title: "Nature, considered over time.", body: "EVERSTEM creates artificial botanical objects for retail, hospitality and commercial interiors." },
    { type: "imageText", eyebrow: "Our approach", title: "Made for the spaces people return to.", body: "We study botanical rhythm, then develop materials, color and structure for objects that stay present long after a fresh arrangement has passed.", image: previewImages.material },
    { type: "capabilities", eyebrow: "From studio to shipment", title: "A complete production partner.", items: ["Material development", "Color matching", "Hand assembly", "Private label", "Export packaging", "Quality control"] },
    { type: "cta", eyebrow: "For trade", title: "Start a conversation.", body: "Tell us what you are sourcing and where it will live.", label: "Contact EVERSTEM", href: "/contact" },
  ]),
  contact: page("contact", "Contact EVERSTEM", "Get in touch with EVERSTEM for wholesale and project enquiries.", [
    { type: "hero", eyebrow: "Contact", title: "Let’s make room for nature.", body: "For wholesale collections, private label and commercial project enquiries, our team is ready to help." },
    { type: "contactDetails", title: "Talk with our team", email: "hello@everstem.com", phone: "+86 20 0000 0000", address: "Guangzhou, China", hours: "Monday–Friday, 09:00–18:00 CST" },
  ]),
  wholesale: page("wholesale", "Wholesale | EVERSTEM", "Wholesale artificial flowers, plants and botanical objects from EVERSTEM.", [
    { type: "hero", eyebrow: "Trade & wholesale", title: "Botanicals for your next collection.", body: "Curated artificial flowers, branches, plants and trees for retailers, importers and commercial projects." },
    { type: "capabilities", eyebrow: "How we work", title: "Built for trade.", items: ["Wholesale collections", "Private label", "Sampling and development", "Export and project supply"] },
  ]),
  privacy: page("privacy", "Privacy | EVERSTEM", "EVERSTEM privacy policy.", [
    { type: "hero", eyebrow: "Privacy", title: "Privacy, clearly stated.", body: "We collect only the details needed to respond to enquiries and improve our service." },
    { type: "richText", heading: "How we use information", document: document(["When you contact EVERSTEM, we use the information you provide to respond to your enquiry and manage our business relationship.", "We do not sell personal information. You may ask us to update or remove your contact information by emailing hello@everstem.com."]) },
  ]),
  terms: page("terms", "Terms | EVERSTEM", "EVERSTEM website terms.", [
    { type: "hero", eyebrow: "Terms", title: "Terms for using this site.", body: "This site is provided to share EVERSTEM’s collections, studio practice and trade services." },
    { type: "richText", heading: "Website terms", document: document(["Images, words and other content on this site belong to EVERSTEM or are used with permission. Please ask before reproducing them.", "Product availability, specifications and lead times are confirmed individually with our sales team."]) },
  ]),
};

export function previewSpace(slug: string): SpaceDetail | null {
  const card = previewSpaces.find((item) => item.slug === slug);
  if (!card) return null;
  return { ...card, id: `preview-${card.slug}`, body: "Each project begins with the space itself: its light, rhythm, material palette and the people who move through it. We develop botanical forms that feel specific to those conditions and retain their presence over time.", images: uniqueImages([card.image]), relatedSpaces: previewSpaces.filter((item) => item.slug !== slug), seo: { title: `${card.title} | EVERSTEM`, description: card.summary } };
}

export function previewArticle(slug: string): ArticleDetail | null {
  const card = previewArticles.find((item) => item.slug === slug);
  if (!card) return null;
  return { ...card, id: `preview-${card.slug}`, body: "Artificial botanicals work best when they are approached as objects, not substitutes. We consider their surface, silhouette and relationship to the surrounding architecture. The aim is a composition with enough nuance to reward attention over time.\n\nThat process brings material research and hand finishing together. It is what lets a permanent botanical element feel grounded in the room where it lives.", relatedArticles: previewArticles.filter((item) => item.slug !== slug), seo: { title: `${card.title} | EVERSTEM`, description: card.summary } };
}

function page(key: string, title: string, description: string, sections: ContentPage["sections"]): ContentPage { return { key, sections, seo: { title, description } }; }
function document(paragraphs: string[]) { return { type: "doc" as const, content: paragraphs.map((text) => ({ type: "paragraph" as const, content: [{ type: "text" as const, text }] })) }; }
function spaceCardFrom(row: Row): SpaceCard { return { title: text(row.title), slug: text(row.slug), category: text(row.category), location: optionalText(row.location), summary: text(row.summary), image: contentImageFromRow(row) }; }
function articleCardFrom(row: Row): ArticleCard { return { title: text(row.title), slug: text(row.slug), summary: text(row.summary), author: optionalText(row.author), publishedAt: optionalText(row.published_at), image: contentImageFromRow(row) }; }
function isSpaceCard(value: SpaceCard): boolean { return Boolean(value.title && value.slug && value.category); }
function isArticleCard(value: ArticleCard): boolean { return Boolean(value.title && value.slug); }
function uniqueImages(images: Array<ContentImage | undefined>): ContentImage[] { return images.filter((image): image is ContentImage => Boolean(image)).filter((image, index, all) => all.findIndex((candidate) => candidate.src === image.src) === index); }
function optionalText(value: unknown): string | undefined { const result = text(value); return result || undefined; }
function titleFor(key: string): string { return key.replace(/(^|-)\w/g, (part) => part.toUpperCase()).replaceAll("-", " "); }
function descriptionFor(key: string): string { return `${titleFor(key)} from EVERSTEM.`; }
