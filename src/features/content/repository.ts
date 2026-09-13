type Row = Record<string, unknown>;

export async function findPublishedPageRow(db: D1Database, key: string, locale: string): Promise<Row | null> {
  return db.prepare("SELECT page_key, sections_json, seo_title, seo_description FROM pages WHERE page_key = ? AND locale = ? AND status = 'published' LIMIT 1").bind(key, locale).first<Row>();
}

export async function listPublishedSpaceRows(db: D1Database, locale: string): Promise<Row[]> {
  const result = await db.prepare(`SELECT s.id, s.title, s.slug, s.category, s.location, s.summary, s.body, s.seo_title, s.seo_description, m.original_filename, m.alt_text
    FROM spaces s LEFT JOIN media m ON m.id = s.cover_media_id AND m.is_deleted = 0
    WHERE s.locale = ? AND s.status = 'published' ORDER BY s.updated_at DESC, s.title, s.id`).bind(locale).all<Row>();
  return result.results;
}

export async function findPublishedSpaceRow(db: D1Database, locale: string, slug: string): Promise<Row | null> {
  return db.prepare(`SELECT s.id, s.title, s.slug, s.category, s.location, s.summary, s.body, s.seo_title, s.seo_description, m.original_filename, m.alt_text
    FROM spaces s LEFT JOIN media m ON m.id = s.cover_media_id AND m.is_deleted = 0
    WHERE s.locale = ? AND s.slug = ? AND s.status = 'published' LIMIT 1`).bind(locale, slug).first<Row>();
}

export async function listSpaceImageRows(db: D1Database, spaceId: string): Promise<Row[]> {
  const result = await db.prepare(`SELECT m.original_filename, COALESCE(si.alt_text, m.alt_text) AS alt_text FROM space_images si
    JOIN media m ON m.id = si.media_id AND m.is_deleted = 0 WHERE si.space_id = ? ORDER BY si.sort_order, si.id`).bind(spaceId).all<Row>();
  return result.results;
}

export async function listRelatedSpaceRows(db: D1Database, locale: string, category: string, id: string): Promise<Row[]> {
  const result = await db.prepare(`SELECT s.title, s.slug, s.category, s.location, s.summary, m.original_filename, m.alt_text FROM spaces s
    LEFT JOIN media m ON m.id = s.cover_media_id AND m.is_deleted = 0 WHERE s.locale = ? AND s.category = ? AND s.id <> ? AND s.status = 'published'
    ORDER BY s.updated_at DESC, s.title, s.id LIMIT 3`).bind(locale, category, id).all<Row>();
  return result.results;
}

export async function listPublishedArticleRows(db: D1Database, locale: string): Promise<Row[]> {
  const result = await db.prepare(`SELECT a.id, a.title, a.slug, a.summary, a.body, a.author, a.published_at, a.seo_title, a.seo_description, m.original_filename, m.alt_text
    FROM articles a LEFT JOIN media m ON m.id = a.cover_media_id AND m.is_deleted = 0 WHERE a.locale = ? AND a.status = 'published'
    ORDER BY a.published_at DESC, a.updated_at DESC, a.id`).bind(locale).all<Row>();
  return result.results;
}

export async function findPublishedArticleRow(db: D1Database, locale: string, slug: string): Promise<Row | null> {
  return db.prepare(`SELECT a.id, a.title, a.slug, a.summary, a.body, a.author, a.published_at, a.seo_title, a.seo_description, m.original_filename, m.alt_text
    FROM articles a LEFT JOIN media m ON m.id = a.cover_media_id AND m.is_deleted = 0 WHERE a.locale = ? AND a.slug = ? AND a.status = 'published' LIMIT 1`).bind(locale, slug).first<Row>();
}

export async function listRelatedArticleRows(db: D1Database, locale: string, id: string): Promise<Row[]> {
  const result = await db.prepare(`SELECT a.title, a.slug, a.summary, a.author, a.published_at, m.original_filename, m.alt_text FROM articles a
    LEFT JOIN media m ON m.id = a.cover_media_id AND m.is_deleted = 0 WHERE a.locale = ? AND a.id <> ? AND a.status = 'published'
    ORDER BY a.published_at DESC, a.updated_at DESC, a.id LIMIT 3`).bind(locale, id).all<Row>();
  return result.results;
}
