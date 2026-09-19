import { z, type ZodType } from "zod";
import { issuePreviewToken, resolvePreviewSecret, type PreviewKind } from "../admin-content/preview";
import type { AuthUser } from "../auth/authorize";
import { HttpError } from "../../lib/http/errors";
import { pageInsertStatement, pageUpdateStatement, type PageWriteStatement } from "./write";
import { isMeaningfulEnglishAltText } from "../media/schemas";

export type AdminEntity = PreviewKind;
export type AdminStatus = "draft" | "published" | "archived";
export type AdminResult = Record<string, unknown> & { id: string; status: AdminStatus; updatedAt: string };

type EntityConfig = {
  table: string;
  nameColumn: string;
  slugColumn?: string;
  categoryColumn?: string;
  searchColumns: string[];
  orderColumns: Record<string, string>;
  editable: Record<string, string>;
  createRequired: string[];
  publishRequired: string[];
  previewPath: (row: AdminResult) => string;
};

const configurations: Record<AdminEntity, EntityConfig> = {
  product: {
    table: "products", nameColumn: "name", slugColumn: "slug", categoryColumn: "category_id",
    searchColumns: ["name", "slug", "product_code"], orderColumns: { name: "name", updatedAt: "updated_at", status: "status" },
    editable: { name: "name", slug: "slug", productCode: "product_code", summary: "summary", body: "body", specifications: "specifications_json", categoryId: "category_id", coverMediaId: "cover_media_id", seoTitle: "seo_title", seoDescription: "seo_description" },
    createRequired: ["name", "slug", "productCode", "categoryId", "specifications"], publishRequired: ["name", "slug", "productCode", "categoryId", "summary", "body"],
    previewPath: (row) => `/products/${encodeURIComponent(String(row.slug))}`,
  },
  category: {
    table: "categories", nameColumn: "name", slugColumn: "slug", searchColumns: ["name", "slug"], orderColumns: { name: "name", updatedAt: "updated_at", status: "status", sortOrder: "sort_order" },
    editable: { name: "name", slug: "slug", description: "description", coverMediaId: "cover_media_id", sortOrder: "sort_order", seoTitle: "seo_title", seoDescription: "seo_description" },
    createRequired: ["name", "slug"], publishRequired: ["name", "slug"], previewPath: (row) => `/collections/${encodeURIComponent(String(row.slug))}`,
  },
  space: {
    table: "spaces", nameColumn: "title", slugColumn: "slug", categoryColumn: "category", searchColumns: ["title", "slug", "category", "location"], orderColumns: { name: "title", updatedAt: "updated_at", status: "status" },
    editable: { title: "title", slug: "slug", category: "category", location: "location", summary: "summary", body: "body", coverMediaId: "cover_media_id", seoTitle: "seo_title", seoDescription: "seo_description" },
    createRequired: ["title", "slug", "category"], publishRequired: ["title", "slug", "category", "summary", "body"], previewPath: (row) => `/spaces/${encodeURIComponent(String(row.slug))}`,
  },
  article: {
    table: "articles", nameColumn: "title", slugColumn: "slug", searchColumns: ["title", "slug", "author"], orderColumns: { name: "title", updatedAt: "updated_at", status: "status", publishedAt: "published_at" },
    editable: { title: "title", slug: "slug", summary: "summary", body: "body", author: "author", coverMediaId: "cover_media_id", seoTitle: "seo_title", seoDescription: "seo_description" },
    createRequired: ["title", "slug"], publishRequired: ["title", "slug", "summary", "body", "author"], previewPath: (row) => `/journal/${encodeURIComponent(String(row.slug))}`,
  },
  page: {
    table: "pages", nameColumn: "page_key", searchColumns: ["page_key", "seo_title"], orderColumns: { name: "page_key", updatedAt: "updated_at", status: "status" },
    editable: { pageKey: "page_key", sections: "sections_json", seoTitle: "seo_title", seoDescription: "seo_description" },
    createRequired: ["pageKey", "sections"], publishRequired: ["pageKey", "sections", "seoTitle", "seoDescription"],
    previewPath: (row) => `/preview/pages/${encodeURIComponent(row.id)}`,
  },
};

const requiredText = z.string().trim().min(1).max(200);
const optionalText = z.string().trim().max(4_000).optional();
const optionalId = z.string().trim().max(120).nullable().optional();
const slug = z.string().trim().min(1).max(160).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u);
const specifications = z.record(z.string().trim().min(1).max(80), z.string().trim().max(500)).refine((value) => Object.keys(value).length <= 50, "Too many specifications.");

const dataSchemas: Record<AdminEntity, ZodType<Record<string, unknown>>> = {
  product: z.object({ name: requiredText, slug, productCode: requiredText.max(80), summary: optionalText, body: optionalText, specifications, categoryId: requiredText.max(120), coverMediaId: optionalId, seoTitle: optionalText, seoDescription: optionalText }).strict(),
  category: z.object({ name: requiredText, slug, description: optionalText, coverMediaId: optionalId, sortOrder: z.number().int().min(0).max(1_000_000).optional(), seoTitle: optionalText, seoDescription: optionalText }).strict(),
  space: z.object({ title: requiredText, slug, category: requiredText, location: optionalText, summary: optionalText, body: optionalText, coverMediaId: optionalId, seoTitle: optionalText, seoDescription: optionalText }).strict(),
  article: z.object({ title: requiredText, slug, summary: optionalText, body: optionalText, author: optionalText, coverMediaId: optionalId, seoTitle: optionalText, seoDescription: optionalText }).strict(),
  page: z.object({ pageKey: z.string().trim().min(1).max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u), sections: z.unknown(), seoTitle: optionalText, seoDescription: optionalText }).strict(),
};

export function parseCreatePayload(entity: AdminEntity, value: unknown): Record<string, unknown> {
  const schema = z.object({ version: z.literal(1), data: dataSchemas[entity] }).strict();
  const payload = parse(schema, value);
  return normalize(entity, payload.data);
}

export function parseUpdatePayload(entity: AdminEntity, value: unknown): { updatedAt: string; data: Record<string, unknown> } {
  const updateData = (dataSchemas[entity] as z.AnyZodObject).partial().refine((data) => Object.keys(data).length > 0, "At least one field is required.");
  const schema = z.object({ version: z.literal(1), updatedAt: z.string().datetime(), data: updateData }).strict();
  const payload = parse(schema, value);
  return { updatedAt: payload.updatedAt, data: normalize(entity, payload.data) };
}

export function parseActionPayload(value: unknown): { action: "publish" | "unpublish" | "archive" | "preview"; updatedAt: string } {
  return parse(z.object({ version: z.literal(1), action: z.enum(["publish", "unpublish", "archive", "preview"]), updatedAt: z.string().datetime() }).strict(), value);
}

export function parseDeletePayload(value: unknown): { updatedAt: string } {
  return parse(z.object({ version: z.literal(1), updatedAt: z.string().datetime() }).strict(), value);
}

export async function listAdminContent(db: D1Database, entity: AdminEntity, query: URLSearchParams): Promise<{ items: AdminResult[]; total: number; page: number; pageSize: number; totalPages: number }> {
  const config = configurations[entity];
  const requestedOrder = query.get("order") ?? "updatedAt";
  if (!(requestedOrder in config.orderColumns)) throw new HttpError("invalid_query", "The requested ordering is not supported.", 422, { order: "Choose a supported ordering." });
  const status = query.get("status");
  if (status && !["draft", "published", "archived"].includes(status)) throw new HttpError("invalid_query", "The requested status is not supported.", 422, { status: "Choose draft, published, or archived." });
  const direction = query.get("direction") ?? "desc";
  if (direction !== "asc" && direction !== "desc") throw new HttpError("invalid_query", "The requested direction is not supported.", 422, { direction: "Choose asc or desc." });
  const page = queryInteger(query.get("page"), 1, 10_000, 1, "page");
  const pageSize = queryInteger(query.get("pageSize"), 1, 100, 20, "pageSize");
  const search = (query.get("q") ?? query.get("search") ?? "").trim();
  if (search.length > 100) throw new HttpError("invalid_query", "Search is too long.", 422, { q: "Use 100 characters or fewer." });
  const category = (query.get("category") ?? "").trim();
  if (category && !config.categoryColumn) throw new HttpError("invalid_query", "Category filtering is not supported here.", 422, { category: "Remove this filter." });

  const where = ["locale = 'en'"];
  const bindings: unknown[] = [];
  if (status) { where.push("status = ?"); bindings.push(status); }
  if (search) {
    where.push(`(${config.searchColumns.map((column) => `${column} LIKE ?`).join(" OR ")})`);
    bindings.push(...config.searchColumns.map(() => `%${search}%`));
  }
  if (category && config.categoryColumn) { where.push(`${config.categoryColumn} = ?`); bindings.push(category); }
  const count = await db.prepare(`SELECT COUNT(*) AS total FROM ${config.table} WHERE ${where.join(" AND ")}`).bind(...bindings).first<{ total: number | string }>();
  const total = Number(count?.total ?? 0);
  const rows = await db.prepare(`SELECT * FROM ${config.table} WHERE ${where.join(" AND ")} ORDER BY ${config.orderColumns[requestedOrder]} ${direction.toUpperCase()}, id ${direction.toUpperCase()} LIMIT ? OFFSET ?`)
    .bind(...bindings, pageSize, (page - 1) * pageSize).all<Record<string, unknown>>();
  return { items: rows.results.map((row) => mapRow(entity, row)), total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}

export async function getAdminContent(db: D1Database, entity: AdminEntity, id: string): Promise<AdminResult> {
  const config = configurations[entity];
  const row = await db.prepare(`SELECT * FROM ${config.table} WHERE id = ? AND locale = 'en' LIMIT 1`).bind(id).first<Record<string, unknown>>();
  if (!row) throw new HttpError("not_found", "Content was not found.", 404);
  return mapRow(entity, row);
}

export async function createAdminContent(db: D1Database, entity: AdminEntity, data: Record<string, unknown>, actor: AuthUser): Promise<AdminResult> {
  const config = configurations[entity];
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const values = withCreateDefaults(entity, data);
  if (hasOwn(values, "coverMediaId")) await validateCoverMedia(db, entity, undefined, values.coverMediaId, "attachment");
  const fields = Object.keys(values);
  const mutation = entity === "page"
    ? preparePageStatement(db, () => pageInsertStatement({
      id, key: String(values.pageKey), locale: "en", sections: values.sections,
      seoTitle: nullableText(values.seoTitle), seoDescription: nullableText(values.seoDescription), createdAt: now, updatedAt: now,
    }))
    : db.prepare(`INSERT INTO ${config.table} (id, locale, status, ${fields.map((field) => config.editable[field]).join(", ")}, created_at, updated_at) VALUES (?, 'en', 'draft', ${fields.map(() => "?").join(", ")}, ?, ?)`)
      .bind(id, ...fields.map((field) => values[field]), now, now);
  try {
    await db.batch([mutation, auditStatement(db, actor, "create", entity, id, now)]);
  } catch (error) {
    throw mapWriteError(error);
  }
  return getAdminContent(db, entity, id);
}

export async function updateAdminContent(db: D1Database, entity: AdminEntity, id: string, expectedUpdatedAt: string, data: Record<string, unknown>, actor: AuthUser): Promise<AdminResult> {
  const config = configurations[entity];
  const current = await getAdminContent(db, entity, id);
  const nextUpdatedAt = nextTimestamp(String(current.updatedAt));
  const fields = Object.keys(data);
  if (hasOwn(data, "coverMediaId")) await validateCoverMedia(db, entity, id, data.coverMediaId, "attachment");
  if (current.status === "published") {
    const merged = { ...current, ...data };
    validatePublish(entity, merged);
    await validateCoverMedia(db, entity, id, merged.coverMediaId, "publish");
    await validateGalleryMedia(db, entity, id);
  }
  const mutation = entity === "page"
    ? preparePageStatement(db, () => pageUpdateStatement({
      id, locale: "en", expectedUpdatedAt, updatedAt: nextUpdatedAt,
      changes: {
        ...(Object.prototype.hasOwnProperty.call(data, "pageKey") ? { key: String(data.pageKey) } : {}),
        ...(Object.prototype.hasOwnProperty.call(data, "sections") ? { sections: data.sections } : {}),
        ...(Object.prototype.hasOwnProperty.call(data, "seoTitle") ? { seoTitle: nullableText(data.seoTitle) } : {}),
        ...(Object.prototype.hasOwnProperty.call(data, "seoDescription") ? { seoDescription: nullableText(data.seoDescription) } : {}),
      },
    }))
    : db.prepare(`UPDATE ${config.table} SET ${fields.map((field) => `${config.editable[field]} = ?`).join(", ")}, updated_at = ? WHERE id = ? AND locale = 'en' AND updated_at = ?`)
      .bind(...fields.map((field) => data[field]), nextUpdatedAt, id, expectedUpdatedAt);
  try {
    const [result] = await db.batch([mutation, auditStatement(db, actor, "update", entity, id, nextUpdatedAt, { fields }, true)]);
    if (Number(result.meta?.changes ?? 0) !== 1) throw conflict();
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw mapWriteError(error);
  }
  return getAdminContent(db, entity, id);
}

export async function transitionAdminContent(
  db: D1Database,
  entity: AdminEntity,
  id: string,
  action: "publish" | "unpublish" | "archive" | "preview",
  actor: AuthUser,
  secret: string,
  expectedUpdatedAt?: string,
): Promise<AdminResult | { token: string; url: string; expiresAt: string }> {
  const config = configurations[entity];
  const current = await getAdminContent(db, entity, id);
  if (expectedUpdatedAt && current.updatedAt !== expectedUpdatedAt) throw conflict();
  if (current.status === "archived") throw new HttpError("invalid_transition", "Archived content cannot be changed or previewed.", 422);
  if (action === "publish" && current.status !== "draft") throw new HttpError("invalid_transition", "Only draft content can be published.", 422);
  if (action === "unpublish" && current.status !== "published") throw new HttpError("invalid_transition", "Only published content can be unpublished.", 422);
  if (action === "preview") {
    const signingSecret = resolvePreviewSecret(secret);
    if (!signingSecret) throw new HttpError("preview_unavailable", "Preview signing is not configured.", 503);
    const token = await issuePreviewToken({ kind: entity, id }, signingSecret);
    const expiresAt = new Date(Date.now() + 5 * 60_000).toISOString();
    return { token, url: `${config.previewPath(current)}?preview=${encodeURIComponent(token)}`, expiresAt };
  }
  if (action === "publish") {
    validatePublish(entity, current);
    await validateCoverMedia(db, entity, id, current.coverMediaId, "publish");
    await validateGalleryMedia(db, entity, id);
  }
  const status: AdminStatus = action === "publish" ? "published" : action === "unpublish" ? "draft" : "archived";
  const nextUpdatedAt = nextTimestamp(current.updatedAt);
  const articlePublished = entity === "article" ? `, published_at = ${action === "publish" ? "COALESCE(published_at, ?)" : action === "unpublish" ? "NULL" : "published_at"}` : "";
  const values: unknown[] = entity === "article" && action === "publish" ? [status, nextUpdatedAt, nextUpdatedAt, id, current.updatedAt] : [status, nextUpdatedAt, id, current.updatedAt];
  let result: D1Result<unknown>;
  try {
    [result] = await db.batch([
      db.prepare(`UPDATE ${config.table} SET status = ?, updated_at = ?${articlePublished} WHERE id = ? AND locale = 'en' AND updated_at = ?`).bind(...values),
      auditStatement(db, actor, action, entity, id, nextUpdatedAt, undefined, true),
    ]);
  } catch (error) {
    throw mapWriteError(error);
  }
  if (Number(result.meta?.changes ?? 0) !== 1) throw conflict();
  return getAdminContent(db, entity, id);
}

function normalize(entity: AdminEntity, input: Record<string, unknown>): Record<string, unknown> {
  const output = { ...input };
  for (const [field, value] of Object.entries(output)) {
    if (typeof value === "string" && !value && !configurations[entity].createRequired.includes(field)) output[field] = null;
  }
  if (Object.prototype.hasOwnProperty.call(output, "specifications")) output.specifications = JSON.stringify(output.specifications);
  return output;
}

function withCreateDefaults(entity: AdminEntity, input: Record<string, unknown>): Record<string, unknown> {
  if (entity === "category") return { ...input, sortOrder: input.sortOrder ?? 0 };
  return input;
}

function validatePublish(entity: AdminEntity, row: AdminResult): void {
  const missing = configurations[entity].publishRequired.filter((field) => {
    const value = row[field];
    if (field === "sections") return !Array.isArray(value) || value.length === 0;
    return typeof value !== "string" || !value.trim();
  });
  if (missing.length) {
    throw new HttpError("publish_validation", "Complete all public fields before publishing.", 422, Object.fromEntries(missing.map((field) => [field, "This field is required to publish."])));
  }
}

async function validateCoverMedia(
  db: D1Database,
  entity: AdminEntity,
  contentId: string | undefined,
  mediaId: unknown,
  context: "attachment" | "publish",
): Promise<void> {
  if (entity === "page" || mediaId === null || mediaId === undefined || mediaId === "") return;
  const assignment = contentId && (entity === "product" || entity === "space")
    ? entity === "product"
      ? "(SELECT pi.alt_text FROM product_images pi WHERE pi.product_id = ? AND pi.media_id = m.id LIMIT 1)"
      : "(SELECT si.alt_text FROM space_images si WHERE si.space_id = ? AND si.media_id = m.id LIMIT 1)"
    : null;
  const row = assignment
    ? await db.prepare(`SELECT COALESCE(${assignment}, m.alt_text) AS alt_text FROM media m WHERE m.id = ? AND m.is_deleted = 0 LIMIT 1`).bind(contentId, mediaId).first<{ alt_text: string | null }>()
    : await db.prepare("SELECT alt_text FROM media WHERE id = ? AND is_deleted = 0 LIMIT 1").bind(mediaId).first<{ alt_text: string | null }>();
  if (row && isMeaningfulEnglishAltText(row.alt_text)) return;
  if (context === "publish") {
    throw new HttpError("publish_validation", "Complete all public fields before publishing.", 422, { coverMediaId: "Choose an active image with meaningful English alternative text." });
  }
  throw new HttpError("invalid_media", "The selected cover image is unavailable or missing meaningful English alternative text.", 422, { coverMediaId: "Choose an active image with meaningful English alternative text." });
}

async function validateGalleryMedia(db: D1Database, entity: AdminEntity, contentId: string): Promise<void> {
  if (entity !== "product" && entity !== "space") return;
  const config = entity === "product"
    ? { table: "product_images", parentColumn: "product_id" }
    : { table: "space_images", parentColumn: "space_id" };
  const rows = await db.prepare(`SELECT gallery.alt_text, media.id AS active_media_id
    FROM ${config.table} gallery
    LEFT JOIN media ON media.id = gallery.media_id AND media.is_deleted = 0
    WHERE gallery.${config.parentColumn} = ?`).bind(contentId).all<{ alt_text: string | null; active_media_id: string | null }>();
  if (rows.results.every((row) => row.active_media_id && isMeaningfulEnglishAltText(row.alt_text))) return;
  throw new HttpError("publish_validation", "Complete all public fields before publishing.", 422, { gallery: "Every gallery image must be active and have meaningful English alternative text." });
}

function mapRow(entity: AdminEntity, row: Record<string, unknown>): AdminResult {
  const config = configurations[entity];
  const output: AdminResult = {
    id: String(row.id), locale: String(row.locale), status: row.status as AdminStatus,
    createdAt: String(row.created_at), updatedAt: String(row.updated_at),
  };
  for (const [property, column] of Object.entries(config.editable)) {
    const value = row[column];
    if (property === "specifications") output[property] = parseJsonObject(value, {});
    else if (property === "sections") output[property] = parseJsonObject(value, []);
    else output[property] = value;
  }
  if (entity === "article") output.publishedAt = row.published_at;
  return output;
}

function parseJsonObject(value: unknown, fallback: Record<string, unknown> | unknown[]): unknown {
  if (typeof value !== "string") return fallback;
  try { return JSON.parse(value) as unknown; } catch { return fallback; }
}

function auditStatement(
  db: D1Database,
  actor: AuthUser,
  action: string,
  entity: AdminEntity,
  id: string,
  timestamp: string,
  context?: object,
  onlyIfPreviousMutationChanged = false,
): D1PreparedStatement {
  const conditionSql = onlyIfPreviousMutationChanged ? " WHERE changes() = 1" : "";
  const values: unknown[] = [crypto.randomUUID(), actor.id, action, entity, id, context ? JSON.stringify(context) : null, timestamp];
  return db.prepare(`INSERT INTO audit_logs (id, actor_user_id, action, entity_type, entity_id, context_text, created_at) SELECT ?, ?, ?, ?, ?, ?, ?${conditionSql}`)
    .bind(...values);
}

function preparePageStatement(db: D1Database, build: () => PageWriteStatement): D1PreparedStatement {
  try {
    const statement = build();
    return db.prepare(statement.sql).bind(...statement.values);
  } catch (error) {
    throw new HttpError("invalid_payload", error instanceof Error ? error.message : "Invalid page sections.", 422, { sections: "Use supported page blocks." });
  }
}

function nullableText(value: unknown): string | null | undefined {
  return value === undefined ? undefined : typeof value === "string" ? value : null;
}

function hasOwn(value: object, property: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, property);
}

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  const fields: Record<string, string> = {};
  for (const issue of result.error.issues) fields[String(issue.path[0] ?? "payload")] ??= issue.message;
  throw new HttpError("invalid_payload", "Please correct the request payload.", 422, fields);
}

function queryInteger(value: string | null, minimum: number, maximum: number, fallback: number, field: string): number {
  if (value === null) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) throw new HttpError("invalid_query", `Invalid ${field}.`, 422, { [field]: `Choose a whole number from ${minimum} to ${maximum}.` });
  return parsed;
}

function nextTimestamp(previous: string): string {
  const now = Date.now();
  const previousTime = Date.parse(previous);
  return new Date(Number.isFinite(previousTime) && now <= previousTime ? previousTime + 1 : now).toISOString();
}

function mapWriteError(error: unknown): HttpError {
  const message = error instanceof Error ? error.message : String(error);
  if (/active media required/iu.test(message)) return new HttpError("invalid_media", "The selected image is unavailable.", 422, { coverMediaId: "Choose an active media item." });
  if (/UNIQUE constraint failed: .*\.(?:locale|slug)/iu.test(message) && /slug/iu.test(message)) return new HttpError("slug_conflict", "That English slug already exists.", 409, { slug: "This slug is already in use." });
  if (/UNIQUE constraint failed: products\.product_code/iu.test(message)) return new HttpError("product_code_conflict", "That product code already exists.", 409, { productCode: "This product code is already in use." });
  if (/UNIQUE constraint failed: pages\.(?:locale|page_key)/iu.test(message)) return new HttpError("page_key_conflict", "That English page key already exists.", 409, { pageKey: "This page key is already in use." });
  if (/FOREIGN KEY constraint failed/iu.test(message)) return new HttpError("invalid_reference", "A referenced record does not exist.", 422, { categoryId: "Choose an existing category." });
  return new HttpError("content_write_failed", "Unable to save content.", 500);
}

function conflict(): HttpError {
  return new HttpError("edit_conflict", "This content changed since you opened it. Reload before saving.", 409);
}
