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

export async function writePage(db: D1Database, input: PageWriteInput): Promise<void> {
  const statement = pageUpsertStatement(input);
  await db.prepare(statement.sql).bind(...statement.values).run();
}
