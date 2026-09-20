import { isMeaningfulEnglishAltText, mediaObjectKeyFromPublicUrl, publicMediaUrl } from "../media/schemas";

export interface ContentImage {
  src: string;
  alt: string;
  width?: number;
  height?: number;
}

export interface RichTextDocument {
  type: "doc";
  content: Array<{ type: "paragraph"; content?: Array<{ type: "text"; text: string }> }>;
}

export type PageBlock =
  | { type: "hero"; eyebrow?: string; title: string; body?: string; image?: ContentImage }
  | { type: "richText"; heading?: string; document: RichTextDocument }
  | { type: "imageText"; eyebrow?: string; title: string; body: string; image: ContentImage; reversed?: boolean }
  | { type: "capabilities"; eyebrow?: string; title: string; items: string[] }
  | { type: "cta"; eyebrow?: string; title: string; body?: string; label: string; href: string }
  | { type: "contactDetails"; title: string; email?: string; phone?: string; address?: string; hours?: string };

export interface ContentPage {
  key: string;
  sections: PageBlock[];
  seo: { title: string; description: string };
}

export interface SpaceCard {
  title: string;
  slug: string;
  category: string;
  location?: string;
  summary: string;
  image?: ContentImage;
}

export interface SpaceDetail extends SpaceCard {
  id: string;
  body: string;
  images: ContentImage[];
  relatedSpaces: SpaceCard[];
  seo: { title: string; description: string };
}

export interface ArticleCard {
  title: string;
  slug: string;
  summary: string;
  author?: string;
  publishedAt?: string;
  image?: ContentImage;
}

export interface ArticleDetail extends ArticleCard {
  id: string;
  body: string;
  relatedArticles: ArticleCard[];
  seo: { title: string; description: string };
}

export function parsePageBlocks(value: unknown): PageBlock[] {
  if (!Array.isArray(value)) throw new Error("Page sections must be an array");
  return value.map((block) => parsePageBlock(block));
}

export function parseStoredPageBlocks(value: unknown): PageBlock[] | null {
  if (typeof value !== "string") return null;
  try {
    return parsePageBlocks(JSON.parse(value));
  } catch {
    return null;
  }
}

export function serializePageBlocks(value: unknown): string {
  return JSON.stringify(parsePageBlocks(value));
}

export function pageMediaObjectKeys(value: unknown): string[] {
  const keys = new Set<string>();
  for (const block of parsePageBlocks(value)) {
    const image = block.type === "hero" || block.type === "imageText" ? block.image : undefined;
    if (!image) continue;
    const key = mediaObjectKeyFromPublicUrl(image.src);
    if (key) keys.add(key);
  }
  return [...keys];
}

export function contentImageFromRow(row: Record<string, unknown>): ContentImage | undefined {
  const src = publicMediaUrl(row);
  if (!src) return undefined;
  const width = dimension(row.width);
  const height = dimension(row.height);
  return { src, alt: text(row.alt_text) || "EVERSTEM botanical object", ...(width && height ? { width, height } : {}) };
}

export function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function parsePageBlock(value: unknown): PageBlock {
  if (!isRecord(value) || typeof value.type !== "string") throw new Error("Invalid page block");
  switch (value.type) {
    case "hero": return { type: "hero", title: requiredText(value.title, "hero title"), eyebrow: optionalText(value.eyebrow), body: optionalText(value.body), image: optionalImage(value.image) };
    case "richText": return { type: "richText", heading: optionalText(value.heading), document: parseRichText(value.document) };
    case "imageText": return { type: "imageText", eyebrow: optionalText(value.eyebrow), title: requiredText(value.title, "image text title"), body: requiredText(value.body, "image text body"), image: parseImage(value.image), reversed: value.reversed === true };
    case "capabilities": return { type: "capabilities", eyebrow: optionalText(value.eyebrow), title: requiredText(value.title, "capabilities title"), items: parseItems(value.items) };
    case "cta": return { type: "cta", eyebrow: optionalText(value.eyebrow), title: requiredText(value.title, "CTA title"), body: optionalText(value.body), label: requiredText(value.label, "CTA label"), href: safeHref(value.href) };
    case "contactDetails": return { type: "contactDetails", title: requiredText(value.title, "contact details title"), email: optionalText(value.email), phone: optionalText(value.phone), address: optionalText(value.address), hours: optionalText(value.hours) };
    default: throw new Error(`Unknown page block type: ${value.type}`);
  }
}

function parseRichText(value: unknown): RichTextDocument {
  if (!isRecord(value) || value.type !== "doc" || !Array.isArray(value.content) || value.content.length > 40) throw new Error("Invalid rich text document");
  return {
    type: "doc",
    content: value.content.map((paragraph) => {
      if (!isRecord(paragraph) || paragraph.type !== "paragraph" || (paragraph.content !== undefined && !Array.isArray(paragraph.content))) throw new Error("Invalid rich text paragraph");
      const content = (paragraph.content ?? []).map((node) => {
        if (!isRecord(node) || node.type !== "text" || typeof node.text !== "string" || node.text.length > 4_000) throw new Error("Invalid rich text node");
        return { type: "text" as const, text: node.text };
      });
      return content.length ? { type: "paragraph" as const, content } : { type: "paragraph" as const };
    }),
  };
}

function parseImage(value: unknown): ContentImage {
  if (!isRecord(value) || typeof value.src !== "string" || !safeImageSrc(value.src)) throw new Error("Invalid content image");
  const alt = typeof value.alt === "string" ? value.alt.trim() : "";
  if (mediaObjectKeyFromPublicUrl(value.src) && !isMeaningfulEnglishAltText(alt)) throw new Error("Invalid content image alternative text");
  return { src: value.src, alt: alt || "EVERSTEM botanical object" };
}
function optionalImage(value: unknown): ContentImage | undefined { return value === undefined ? undefined : parseImage(value); }
function parseItems(value: unknown): string[] {
  if (!Array.isArray(value) || !value.length || value.length > 16 || value.some((item) => typeof item !== "string" || !item.trim() || item.length > 180)) throw new Error("Invalid capabilities");
  return value;
}
function safeHref(value: unknown): string {
  const href = requiredText(value, "CTA link");
  if (!href.startsWith("/") || href.startsWith("//")) throw new Error("Invalid CTA link");
  return href;
}
function safeImageSrc(value: string): boolean {
  return value.length <= 512 && (value.startsWith("/assets/") && !value.includes("..") || Boolean(mediaObjectKeyFromPublicUrl(value)));
}
function requiredText(value: unknown, label: string): string { if (typeof value !== "string" || !value.trim() || value.length > 4_000) throw new Error(`Invalid ${label}`); return value; }
function optionalText(value: unknown): string | undefined { return typeof value === "string" && value.trim() && value.length <= 4_000 ? value : undefined; }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function dimension(value: unknown): number | undefined { const parsed = typeof value === "number" ? value : Number(value); return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined; }
