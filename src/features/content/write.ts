import { serializePageBlocks } from "./schemas";

export type ContentStatus = "draft" | "published" | "archived";

export interface PageWriteInput {
  id: string;
  key: string;
  locale: string;
  status: ContentStatus;
  sections: unknown;
  seoTitle?: string;
  seoDescription?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PageWriteStatement {
  sql: string;
  values: unknown[];
}

export interface PageCreateInput {
  id: string;
  key: string;
  locale: string;
  sections: unknown;
  seoTitle?: string | null;
  seoDescription?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PageUpdateInput {
  id: string;
  locale: string;
  expectedUpdatedAt: string;
  updatedAt: string;
  changes: {
    key?: string;
    sections?: unknown;
    seoTitle?: string | null;
    seoDescription?: string | null;
  };
}

/** The single page persistence boundary: it validates all block JSON before D1 receives it. */
export function pageUpsertStatement(input: PageWriteInput): PageWriteStatement {
  return {
    sql: `INSERT INTO pages (id, page_key, locale, sections_json, seo_title, seo_description, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(locale, page_key) DO UPDATE SET sections_json = excluded.sections_json, seo_title = excluded.seo_title,
        seo_description = excluded.seo_description, status = excluded.status, updated_at = excluded.updated_at`,
    values: [input.id, input.key, input.locale, serializePageBlocks(input.sections), input.seoTitle ?? null, input.seoDescription ?? null, input.status, input.createdAt, input.updatedAt],
  };
}

/** Admin insert boundary: validates page blocks before producing any SQL. */
export function pageInsertStatement(input: PageCreateInput): PageWriteStatement {
  return {
    sql: `INSERT INTO pages (id, page_key, locale, sections_json, seo_title, seo_description, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 'draft', ?, ?)`,
    values: [input.id, input.key, input.locale, serializePageBlocks(input.sections), input.seoTitle ?? null, input.seoDescription ?? null, input.createdAt, input.updatedAt],
  };
}

/** Admin compare-and-swap update boundary: validates changed blocks before producing any SQL. */
export function pageUpdateStatement(input: PageUpdateInput): PageWriteStatement {
  const columns: string[] = [];
  const values: unknown[] = [];
  if (Object.prototype.hasOwnProperty.call(input.changes, "key")) { columns.push("page_key = ?"); values.push(input.changes.key); }
  if (Object.prototype.hasOwnProperty.call(input.changes, "sections")) { columns.push("sections_json = ?"); values.push(serializePageBlocks(input.changes.sections)); }
  if (Object.prototype.hasOwnProperty.call(input.changes, "seoTitle")) { columns.push("seo_title = ?"); values.push(input.changes.seoTitle ?? null); }
  if (Object.prototype.hasOwnProperty.call(input.changes, "seoDescription")) { columns.push("seo_description = ?"); values.push(input.changes.seoDescription ?? null); }
  if (!columns.length) throw new Error("At least one page field is required");
  return {
    sql: `UPDATE pages SET ${columns.join(", ")}, updated_at = ? WHERE id = ? AND locale = ? AND updated_at = ?`,
    values: [...values, input.updatedAt, input.id, input.locale, input.expectedUpdatedAt],
  };
}

export async function writePage(db: D1Database, input: PageWriteInput): Promise<void> {
  const statement = pageUpsertStatement(input);
  await db.prepare(statement.sql).bind(...statement.values).run();
}
