import { z } from "zod";
import { HttpError } from "../../lib/http/errors";

export const mediaMimeTypes = ["image/jpeg", "image/png", "image/webp", "image/avif"] as const;
export type MediaMimeType = (typeof mediaMimeTypes)[number];
export type GalleryEntity = "product" | "space";
export const immutableMediaKeyPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(?:jpg|png|webp|avif)$/u;

export type MediaRecord = {
  id: string;
  objectKey: string;
  originalFilename: string;
  mimeType: MediaMimeType;
  byteSize: number;
  width: number | null;
  height: number | null;
  altText: string | null;
  url: string;
  createdAt: string;
  updatedAt: string;
};

export type GalleryInputItem = {
  mediaId: string;
  altText: string;
  isCover: boolean;
};

export type GalleryRecordItem = GalleryInputItem & {
  id: string;
  sortOrder: number;
  media: MediaRecord;
};

const optionalAltText = z.string().trim().max(300).nullable().optional();
const nullableAltText = z.string().trim().max(300).nullable();
const meaningfulEnglishAltText = z.string().trim().min(3).max(300)
  .refine(isMeaningfulEnglishAltText, "Alternative text must describe the image in English.");

const galleryItem = z.object({
  mediaId: z.string().uuid(),
  altText: meaningfulEnglishAltText,
  isCover: z.boolean(),
}).strict();

export function parseAltText(value: unknown): string | null {
  return parse(optionalAltText, value) ?? null;
}

export function parseAltTextUpdate(value: unknown): { altText: string | null } {
  return parse(z.object({ version: z.literal(1), altText: nullableAltText }).strict(), value);
}

export function isMeaningfulEnglishAltText(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const normalized = value.trim();
  if (normalized.length < 3 || normalized.length > 300 || /[\p{Cc}\p{Cf}]/u.test(normalized)) return false;
  const letters = Array.from(normalized).filter((character) => /\p{L}/u.test(character));
  return letters.length >= 3 && letters.every((character) => /\p{Script=Latin}/u.test(character));
}

export function publicMediaUrl(row: Record<string, unknown>): string | undefined {
  const objectKey = typeof row.object_key === "string" ? row.object_key : "";
  if (immutableMediaKeyPattern.test(objectKey)) return `/media/${encodeURIComponent(objectKey)}`;
  const filename = typeof row.original_filename === "string" ? row.original_filename : "";
  if (!filename || filename.includes("..") || filename.includes("/") || filename.includes("\\")) return undefined;
  return `/assets/${encodeURIComponent(filename)}`;
}

export function parseGalleryPayload(value: unknown): { entity: GalleryEntity; contentId: string; items: GalleryInputItem[] } {
  const payload = parse(z.object({
    version: z.literal(1),
    entity: z.enum(["product", "space"]),
    contentId: z.string().trim().min(1).max(120),
    items: z.array(galleryItem).max(50),
  }).strict(), value);
  const mediaIds = new Set(payload.items.map((item) => item.mediaId));
  if (mediaIds.size !== payload.items.length) throw invalid({ items: "Each image may appear only once in a gallery." });
  const coverCount = payload.items.filter((item) => item.isCover).length;
  if ((payload.items.length > 0 && coverCount !== 1) || (payload.items.length === 0 && coverCount !== 0)) {
    throw invalid({ items: "Choose exactly one cover image for a non-empty gallery." });
  }
  return payload;
}

export function parseMediaListQuery(query: URLSearchParams): { search: string; page: number; pageSize: number } {
  const search = (query.get("q") ?? "").trim();
  if (search.length > 100) throw new HttpError("invalid_query", "Search is too long.", 422, { q: "Use 100 characters or fewer." });
  return {
    search,
    page: integer(query.get("page"), 1, 10_000, 1, "page"),
    pageSize: integer(query.get("pageSize"), 1, 100, 24, "pageSize"),
  };
}

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  const fields: Record<string, string> = {};
  for (const issue of result.error.issues) fields[String(issue.path[0] ?? "payload")] ??= issue.message;
  throw invalid(fields);
}

function invalid(fields: Record<string, string>): HttpError {
  return new HttpError("invalid_payload", "Please correct the request payload.", 422, fields);
}

function integer(value: string | null, minimum: number, maximum: number, fallback: number, field: string): number {
  if (value === null) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new HttpError("invalid_query", "The requested pagination is invalid.", 422, { [field]: `Choose a whole number from ${minimum} to ${maximum}.` });
  }
  return parsed;
}
