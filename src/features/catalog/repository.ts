type Row = Record<string, unknown>;

export interface ProductListQuery {
  locale: string;
  categorySlug?: string;
  limit: number;
  offset: number;
}

export async function listPublishedProductRows(db: D1Database, query: ProductListQuery): Promise<Row[]> {
  const filters = ["p.locale = ?", "c.locale = ?", "p.status = 'published'", "c.status = 'published'"];
  const values: unknown[] = [query.locale, query.locale];
  if (query.categorySlug) {
    filters.push("c.slug = ?");
    values.push(query.categorySlug);
  }
  values.push(query.limit, query.offset);
  const result = await db.prepare(`
    SELECT p.name, p.slug, p.summary, c.name AS category_name, c.slug AS category_slug,
      m.object_key, m.original_filename, m.width, m.height,
      COALESCE((SELECT pi.alt_text FROM product_images pi
        WHERE pi.product_id = p.id AND pi.media_id = p.cover_media_id
        ORDER BY pi.is_cover DESC, pi.sort_order, pi.id LIMIT 1), m.alt_text) AS alt_text
    FROM products p
    JOIN categories c ON c.id = p.category_id
    LEFT JOIN media m ON m.id = p.cover_media_id AND m.is_deleted = 0
    WHERE ${filters.join(" AND ")}
    ORDER BY c.sort_order, p.name, p.id
    LIMIT ? OFFSET ?
  `).bind(...values).all<Row>();
  return result.results;
}

export async function countPublishedProductRows(db: D1Database, locale: string, categorySlug?: string): Promise<number> {
  const categoryFilter = categorySlug ? " AND c.slug = ?" : "";
  const values = categorySlug ? [locale, locale, categorySlug] : [locale, locale];
  const row = await db.prepare(`
    SELECT COUNT(*) AS total
    FROM products p JOIN categories c ON c.id = p.category_id
    WHERE p.locale = ? AND c.locale = ? AND p.status = 'published' AND c.status = 'published'${categoryFilter}
  `).bind(...values).first<Row>();
  return typeof row?.total === "number" ? row.total : Number(row?.total) || 0;
}

export async function findPublishedProductRow(db: D1Database, locale: string, slug: string): Promise<Row | null> {
  return db.prepare(`
    SELECT p.id, p.name, p.slug, p.product_code, p.summary, p.body, p.specifications_json,
      p.seo_title, p.seo_description, c.name AS category_name, c.slug AS category_slug,
      m.object_key, m.original_filename, m.width, m.height,
      COALESCE((SELECT pi.alt_text FROM product_images pi
        WHERE pi.product_id = p.id AND pi.media_id = p.cover_media_id
        ORDER BY pi.is_cover DESC, pi.sort_order, pi.id LIMIT 1), m.alt_text) AS alt_text
    FROM products p
    JOIN categories c ON c.id = p.category_id
    LEFT JOIN media m ON m.id = p.cover_media_id AND m.is_deleted = 0
    WHERE p.locale = ? AND p.slug = ? AND c.locale = ? AND p.status = 'published' AND c.status = 'published'
    LIMIT 1
  `).bind(locale, slug, locale).first<Row>();
}

export async function findPreviewProductRow(db: D1Database, locale: string, id: string, slug: string): Promise<Row | null> {
  return db.prepare(`
    SELECT p.id, p.name, p.slug, p.product_code, p.summary, p.body, p.specifications_json,
      p.seo_title, p.seo_description, c.name AS category_name, c.slug AS category_slug,
      m.object_key, m.original_filename, m.width, m.height,
      COALESCE((SELECT pi.alt_text FROM product_images pi
        WHERE pi.product_id = p.id AND pi.media_id = p.cover_media_id
        ORDER BY pi.is_cover DESC, pi.sort_order, pi.id LIMIT 1), m.alt_text) AS alt_text
    FROM products p
    JOIN categories c ON c.id = p.category_id
    LEFT JOIN media m ON m.id = p.cover_media_id AND m.is_deleted = 0
    WHERE p.id = ? AND p.locale = ? AND p.slug = ? AND p.status <> 'archived'
    LIMIT 1
  `).bind(id, locale, slug).first<Row>();
}

export async function listProductImageRows(db: D1Database, productId: string): Promise<Row[]> {
  const result = await db.prepare(`
    SELECT m.object_key, m.original_filename, m.width, m.height, COALESCE(pi.alt_text, m.alt_text) AS alt_text
    FROM product_images pi
    JOIN media m ON m.id = pi.media_id AND m.is_deleted = 0
    WHERE pi.product_id = ?
    ORDER BY pi.is_cover DESC, pi.sort_order, pi.id
  `).bind(productId).all<Row>();
  return result.results;
}

export async function listRelatedProductRows(db: D1Database, locale: string, categorySlug: string, productId: string): Promise<Row[]> {
  const result = await db.prepare(`
    SELECT p.name, p.slug, p.summary, c.name AS category_name, c.slug AS category_slug,
      m.object_key, m.original_filename, m.width, m.height,
      COALESCE((SELECT pi.alt_text FROM product_images pi
        WHERE pi.product_id = p.id AND pi.media_id = p.cover_media_id
        ORDER BY pi.is_cover DESC, pi.sort_order, pi.id LIMIT 1), m.alt_text) AS alt_text
    FROM products p
    JOIN categories c ON c.id = p.category_id
    LEFT JOIN media m ON m.id = p.cover_media_id AND m.is_deleted = 0
    WHERE p.locale = ? AND c.locale = ? AND c.slug = ? AND p.id <> ? AND p.status = 'published' AND c.status = 'published'
    ORDER BY p.name, p.id
    LIMIT 3
  `).bind(locale, locale, categorySlug, productId).all<Row>();
  return result.results;
}

export async function listPublishedCategoryRows(db: D1Database, locale: string): Promise<Row[]> {
  const result = await db.prepare(`
    SELECT c.name, c.slug, c.description, m.object_key, m.original_filename, m.width, m.height, m.alt_text
    FROM categories c
    LEFT JOIN media m ON m.id = c.cover_media_id AND m.is_deleted = 0
    WHERE c.locale = ? AND c.status = 'published'
    ORDER BY c.sort_order, c.name, c.id
  `).bind(locale).all<Row>();
  return result.results;
}

export async function findPublishedCategoryRow(db: D1Database, locale: string, slug: string): Promise<Row | null> {
  return db.prepare(`
    SELECT c.name, c.slug, c.description, m.object_key, m.original_filename, m.width, m.height, m.alt_text
    FROM categories c
    LEFT JOIN media m ON m.id = c.cover_media_id AND m.is_deleted = 0
    WHERE c.locale = ? AND c.slug = ? AND c.status = 'published'
    LIMIT 1
  `).bind(locale, slug).first<Row>();
}

export async function findPreviewCategoryRow(db: D1Database, locale: string, id: string, slug: string): Promise<Row | null> {
  return db.prepare(`
    SELECT c.name, c.slug, c.description, m.object_key, m.original_filename, m.width, m.height, m.alt_text
    FROM categories c
    LEFT JOIN media m ON m.id = c.cover_media_id AND m.is_deleted = 0
    WHERE c.id = ? AND c.locale = ? AND c.slug = ? AND c.status <> 'archived'
    LIMIT 1
  `).bind(id, locale, slug).first<Row>();
}
