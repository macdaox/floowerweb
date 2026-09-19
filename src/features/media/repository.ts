import { HttpError } from "../../lib/http/errors";
import type { GalleryEntity, GalleryInputItem, GalleryRecordItem, MediaMimeType, MediaRecord } from "./schemas";

type MediaRow = {
  id: string;
  object_key: string;
  original_filename: string;
  mime_type: MediaMimeType;
  byte_size: number;
  width: number | null;
  height: number | null;
  alt_text: string | null;
  is_deleted: number;
  created_at: string;
  updated_at: string;
};

export async function insertMedia(db: D1Database, record: Omit<MediaRecord, "url">, createdByUserId: string): Promise<MediaRecord> {
  await db.prepare(`INSERT INTO media
    (id, object_key, original_filename, mime_type, byte_size, width, height, alt_text, is_deleted, created_by_user_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`)
    .bind(record.id, record.objectKey, record.originalFilename, record.mimeType, record.byteSize, record.width, record.height, record.altText, createdByUserId, record.createdAt, record.updatedAt)
    .run();
  return { ...record, url: mediaUrl(record.objectKey) };
}

export async function getMedia(db: D1Database, id: string): Promise<MediaRecord> {
  const row = await db.prepare("SELECT * FROM media WHERE id = ? AND is_deleted = 0 LIMIT 1").bind(id).first<MediaRow>();
  if (!row) throw new HttpError("not_found", "Media was not found.", 404);
  return mapMedia(row);
}

export async function listMedia(db: D1Database, search: string, page: number, pageSize: number): Promise<{ items: MediaRecord[]; total: number; page: number; pageSize: number; totalPages: number }> {
  const where = search ? "is_deleted = 0 AND (original_filename LIKE ? OR alt_text LIKE ?)" : "is_deleted = 0";
  const bindings = search ? [`%${search}%`, `%${search}%`] : [];
  const count = await db.prepare(`SELECT COUNT(*) AS total FROM media WHERE ${where}`).bind(...bindings).first<{ total: number | string }>();
  const total = Number(count?.total ?? 0);
  const rows = await db.prepare(`SELECT * FROM media WHERE ${where} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`)
    .bind(...bindings, pageSize, (page - 1) * pageSize).all<MediaRow>();
  return { items: rows.results.map(mapMedia), total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}

export async function updateMediaAltText(db: D1Database, id: string, altText: string | null): Promise<MediaRecord> {
  const now = new Date().toISOString();
  const result = await db.prepare("UPDATE media SET alt_text = ?, updated_at = ? WHERE id = ? AND is_deleted = 0")
    .bind(altText, now, id).run();
  if (Number(result.meta?.changes ?? 0) !== 1) throw new HttpError("not_found", "Media was not found.", 404);
  return getMedia(db, id);
}

export async function findMediaReferences(db: D1Database, id: string): Promise<string[]> {
  const checks = [
    ["category cover", "categories", "cover_media_id"],
    ["product cover", "products", "cover_media_id"],
    ["product gallery", "product_images", "media_id"],
    ["space cover", "spaces", "cover_media_id"],
    ["space gallery", "space_images", "media_id"],
    ["article cover", "articles", "cover_media_id"],
  ] as const;
  const results = await db.batch(checks.map(([, table, column]) => db.prepare(`SELECT COUNT(*) AS count FROM ${table} WHERE ${column} = ?`).bind(id)));
  return checks.filter((_, index) => Number((results[index].results?.[0] as { count?: number | string } | undefined)?.count ?? 0) > 0).map(([label]) => label);
}

export async function markMediaDeleted(db: D1Database, id: string, timestamp: string, actorUserId?: string): Promise<void> {
  const mutation = db.prepare(`UPDATE media SET is_deleted = 1, deleted_at = ?, updated_at = ?
    WHERE id = ? AND is_deleted = 0
      AND NOT EXISTS (SELECT 1 FROM categories WHERE cover_media_id = ?)
      AND NOT EXISTS (SELECT 1 FROM products WHERE cover_media_id = ?)
      AND NOT EXISTS (SELECT 1 FROM product_images WHERE media_id = ?)
      AND NOT EXISTS (SELECT 1 FROM spaces WHERE cover_media_id = ?)
      AND NOT EXISTS (SELECT 1 FROM space_images WHERE media_id = ?)
      AND NOT EXISTS (SELECT 1 FROM articles WHERE cover_media_id = ?)`)
    .bind(timestamp, timestamp, id, id, id, id, id, id, id);
  const statements = actorUserId ? [
    mutation,
    db.prepare("INSERT INTO audit_logs (id, actor_user_id, action, entity_type, entity_id, context_text, created_at) SELECT ?, ?, 'delete', 'media', ?, NULL, ? WHERE changes() = 1")
      .bind(crypto.randomUUID(), actorUserId, id, timestamp),
  ] : [mutation];
  const [result] = await db.batch(statements);
  if (Number(result.meta?.changes ?? 0) !== 1) {
    if ((await findMediaReferences(db, id)).length > 0) throw new HttpError("media_referenced", "This image is referenced by content and cannot be deleted.", 409, { media: "Remove it from content and galleries first." });
    throw new HttpError("not_found", "Media was not found.", 404);
  }
}

export async function getGallery(db: D1Database, entity: GalleryEntity, contentId: string): Promise<{ entity: GalleryEntity; contentId: string; items: GalleryRecordItem[] }> {
  const config = galleryConfig(entity);
  const parent = await db.prepare(`SELECT id, cover_media_id FROM ${config.parentTable} WHERE id = ? AND locale = 'en' LIMIT 1`).bind(contentId).first<{ id: string; cover_media_id: string | null }>();
  if (!parent) throw new HttpError("not_found", "Content was not found.", 404);
  const coverExpression = entity === "product" ? "gallery.is_cover" : "CASE WHEN parent.cover_media_id = gallery.media_id THEN 1 ELSE 0 END";
  const rows = await db.prepare(`SELECT gallery.id AS gallery_id, gallery.media_id, gallery.alt_text AS gallery_alt_text, gallery.sort_order,
    ${coverExpression} AS is_cover, media.*
    FROM ${config.galleryTable} gallery
    JOIN ${config.parentTable} parent ON parent.id = gallery.${config.parentColumn}
    JOIN media ON media.id = gallery.media_id AND media.is_deleted = 0
    WHERE gallery.${config.parentColumn} = ?
    ORDER BY gallery.sort_order ASC, gallery.id ASC`).bind(contentId).all<MediaRow & { gallery_id: string; media_id: string; gallery_alt_text: string; sort_order: number; is_cover: number }>();
  return {
    entity,
    contentId,
    items: rows.results.map((row) => ({
      id: row.gallery_id,
      mediaId: row.media_id,
      altText: row.gallery_alt_text,
      sortOrder: row.sort_order,
      isCover: Boolean(row.is_cover),
      media: mapMedia(row),
    })),
  };
}

export async function replaceGallery(db: D1Database, entity: GalleryEntity, contentId: string, items: GalleryInputItem[], actorUserId: string): Promise<{ entity: GalleryEntity; contentId: string; items: GalleryRecordItem[] }> {
  const config = galleryConfig(entity);
  const parent = await db.prepare(`SELECT id, status FROM ${config.parentTable} WHERE id = ? AND locale = 'en' LIMIT 1`).bind(contentId).first<{ id: string; status: string }>();
  if (!parent) throw new HttpError("not_found", "Content was not found.", 404);
  if (parent.status === "archived") throw new HttpError("invalid_transition", "Archived content cannot be changed.", 422);
  if (items.length > 0) {
    const placeholders = items.map(() => "?").join(", ");
    const found = await db.prepare(`SELECT id FROM media WHERE is_deleted = 0 AND id IN (${placeholders})`).bind(...items.map((item) => item.mediaId)).all<{ id: string }>();
    if (found.results.length !== items.length) throw new HttpError("invalid_media", "One or more selected images are unavailable.", 422, { items: "Select active media items." });
  }
  const now = new Date().toISOString();
  const coverId = items.find((item) => item.isCover)?.mediaId ?? null;
  const statements: D1PreparedStatement[] = [
    db.prepare(`DELETE FROM ${config.galleryTable} WHERE ${config.parentColumn} = ?`).bind(contentId),
    ...items.map((item, index) => entity === "product"
      ? db.prepare("INSERT INTO product_images (id, product_id, media_id, alt_text, sort_order, is_cover, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
        .bind(crypto.randomUUID(), contentId, item.mediaId, item.altText.trim(), index, item.isCover ? 1 : 0, now)
      : db.prepare("INSERT INTO space_images (id, space_id, media_id, alt_text, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?)")
        .bind(crypto.randomUUID(), contentId, item.mediaId, item.altText.trim(), index, now)),
    db.prepare(`UPDATE ${config.parentTable} SET cover_media_id = ? WHERE id = ? AND locale = 'en'`).bind(coverId, contentId),
    db.prepare("INSERT INTO audit_logs (id, actor_user_id, action, entity_type, entity_id, context_text, created_at) VALUES (?, ?, 'gallery.update', ?, ?, ?, ?)")
      .bind(crypto.randomUUID(), actorUserId, entity, contentId, JSON.stringify({ mediaIds: items.map((item) => item.mediaId) }), now),
  ];
  try {
    await db.batch(statements);
  } catch (error) {
    if (/active media required/iu.test(error instanceof Error ? error.message : String(error))) {
      throw new HttpError("invalid_media", "One or more selected images are unavailable.", 422, { items: "Select active media items." });
    }
    throw error;
  }
  return getGallery(db, entity, contentId);
}

function galleryConfig(entity: GalleryEntity): { parentTable: string; galleryTable: string; parentColumn: string } {
  return entity === "product"
    ? { parentTable: "products", galleryTable: "product_images", parentColumn: "product_id" }
    : { parentTable: "spaces", galleryTable: "space_images", parentColumn: "space_id" };
}

function mapMedia(row: MediaRow): MediaRecord {
  return {
    id: String(row.id),
    objectKey: String(row.object_key),
    originalFilename: String(row.original_filename),
    mimeType: row.mime_type,
    byteSize: Number(row.byte_size),
    width: row.width === null ? null : Number(row.width),
    height: row.height === null ? null : Number(row.height),
    altText: row.alt_text === null ? null : String(row.alt_text),
    url: mediaUrl(String(row.object_key)),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function mediaUrl(objectKey: string): string {
  return `/media/${encodeURIComponent(objectKey)}`;
}
