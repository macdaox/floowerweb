import type { APIRoute } from "astro";
import { requireRole } from "../../../../features/auth/authorize";
import { HttpError } from "../../../../lib/http/errors";
import { fail, ok } from "../../../../lib/http/result";

export const GET: APIRoute = async ({ request, locals }) => {
  try {
    requireRole(locals, ["admin", "sales"]);
    return ok(await querySubscribers(locals.runtime.env.DB, new URL(request.url).searchParams, true));
  } catch (error) {
    if (error instanceof HttpError) return fail(error.code, error.message, error.status, error.fields);
    return fail("internal_error", "Unable to load subscribers.", 500);
  }
};

export async function querySubscribers(db: D1Database, search: URLSearchParams, paginate: boolean) {
  const where = ["1 = 1"];
  const values: unknown[] = [];
  const status = search.get("status")?.trim();
  if (status) {
    if (!(["subscribed", "unsubscribed"] as const).includes(status as "subscribed" | "unsubscribed")) throw new HttpError("invalid_filter", "Invalid subscriber status.", 422);
    where.push("status = ?"); values.push(status);
  }
  const source = search.get("source")?.trim();
  if (source) { where.push("source = ?"); values.push(source); }
  const query = search.get("q")?.trim();
  if (query) { where.push("(email LIKE ? OR source LIKE ?)"); values.push(`%${query}%`, `%${query}%`); }
  addDateRange(search, where, values);
  const page = Math.max(1, Number.parseInt(search.get("page") ?? "1", 10) || 1);
  const pageSize = paginate ? Math.min(100, Math.max(1, Number.parseInt(search.get("pageSize") ?? "50", 10) || 50)) : -1;
  const count = await db.prepare(`SELECT COUNT(*) AS total FROM subscribers WHERE ${where.join(" AND ")}`).bind(...values).first<{ total: number | string }>();
  const rows = await db.prepare(`SELECT id, email, source, status, subscribed_at AS subscribedAt, unsubscribed_at AS unsubscribedAt,
    created_at AS createdAt, updated_at AS updatedAt FROM subscribers WHERE ${where.join(" AND ")} ORDER BY subscribed_at DESC, id DESC LIMIT ? OFFSET ?`)
    .bind(...values, pageSize, paginate ? (page - 1) * pageSize : 0).all();
  const total = Number(count?.total ?? 0);
  return { items: rows.results, page, pageSize: paginate ? pageSize : total, total, totalPages: paginate ? Math.max(1, Math.ceil(total / pageSize)) : 1 };
}

function addDateRange(search: URLSearchParams, where: string[], values: unknown[]) {
  for (const [key, operator, suffix] of [["dateFrom", ">=", "T00:00:00.000Z"], ["dateTo", "<", "T00:00:00.000Z"]] as const) {
    const value = search.get(key)?.trim();
    if (!value) continue;
    if (!validIsoDay(value)) throw new HttpError("invalid_filter", `Invalid ${key}.`, 422);
    const bound = key === "dateTo" ? new Date(new Date(`${value}${suffix}`).getTime() + 86_400_000).toISOString() : `${value}${suffix}`;
    where.push(`subscribed_at ${operator} ?`); values.push(bound);
  }
}

function validIsoDay(value: string): boolean { if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false; const date = new Date(`${value}T00:00:00.000Z`); return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value; }
