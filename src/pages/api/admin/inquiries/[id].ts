import type { APIRoute } from "astro";
import { z } from "zod";
import { requireRole, type AuthUser } from "../../../../features/auth/authorize";
import { HttpError } from "../../../../lib/http/errors";
import { assertAllowedOrigin } from "../../../../lib/http/origin";
import { parseJson } from "../../../../lib/http/request";
import { fail, ok } from "../../../../lib/http/result";

const statuses = ["new", "contacted", "qualified", "closed", "spam"] as const;
const transitions: Record<(typeof statuses)[number], readonly (typeof statuses)[number][]> = {
  new: ["contacted", "spam"],
  contacted: ["qualified", "closed", "spam"],
  qualified: ["closed", "contacted"],
  closed: ["contacted"],
  spam: ["contacted"],
};
const payloadSchema = z.discriminatedUnion("action", [
  z.object({ version: z.literal(1).optional(), action: z.literal("assign"), assigneeUserId: z.string().min(1).nullable(), updatedAt: z.string().datetime() }).strict(),
  z.object({ version: z.literal(1).optional(), action: z.literal("transition"), status: z.enum(statuses), updatedAt: z.string().datetime() }).strict(),
  z.object({ version: z.literal(1).optional(), action: z.literal("note"), note: z.string().trim().min(1).max(4_000), updatedAt: z.string().datetime() }).strict(),
]);

type InquiryRow = { id: string; status: (typeof statuses)[number]; updatedAt: string };

export const GET: APIRoute = async ({ request, locals, params }) => {
  try {
    requireRole(locals, ["admin", "sales"]);
    return ok(!params.id || params.id === "list"
      ? await listInquiries(locals.runtime.env.DB, new URL(request.url).searchParams)
      : await inquiryDetail(locals.runtime.env.DB, params.id));
  } catch (error) {
    return operationError(error, "Unable to load inquiries.");
  }
};

export const POST: APIRoute = async ({ request, locals, params }) => {
  try {
    const actor = requireRole(locals, ["admin", "sales"]);
    assertAllowedOrigin(request, new URL(request.url).origin);
    if (!params.id || params.id === "list") throw new HttpError("not_found", "An inquiry id is required.", 404);
    const parsed = payloadSchema.safeParse(await parseJson<unknown>(request, 16_000));
    if (!parsed.success) throw new HttpError("invalid_payload", "The inquiry operation is invalid.", 422);
    const result = await mutateInquiry(locals.runtime.env.DB, params.id, parsed.data, actor);
    return ok(result, parsed.data.action === "note" ? 201 : 200);
  } catch (error) {
    return operationError(error, "Unable to update this inquiry.");
  }
};

async function listInquiries(db: D1Database, search: URLSearchParams) {
  const where = ["1 = 1"];
  const values: unknown[] = [];
  addEnumFilter(search, "type", ["product", "contact", "catalog"], "i.inquiry_type", where, values);
  addEnumFilter(search, "status", statuses, "i.status", where, values);
  const assignee = clean(search.get("assignee"));
  if (assignee) { where.push("i.assignee_user_id = ?"); values.push(assignee); }
  const market = clean(search.get("market"));
  if (market) { where.push("i.country = ?"); values.push(market); }
  const product = clean(search.get("product"));
  if (product) { where.push("(i.product_id = ? OR p.name LIKE ? OR p.product_code LIKE ?)"); values.push(product, `%${product}%`, `%${product}%`); }
  addDateRange(search, "i.created_at", where, values);
  const query = clean(search.get("q"));
  if (query) {
    where.push("(i.name LIKE ? OR i.email LIKE ? OR COALESCE(i.company, '') LIKE ?)");
    values.push(`%${query}%`, `%${query}%`, `%${query}%`);
  }
  const { page, pageSize } = pagination(search);
  const count = await db.prepare(`SELECT COUNT(*) AS total FROM inquiries i LEFT JOIN products p ON p.id = i.product_id WHERE ${where.join(" AND ")}`).bind(...values).first<{ total: number | string }>();
  const rows = await db.prepare(`SELECT i.id, i.inquiry_type AS inquiryType, i.name, i.email, i.company, i.country, i.status,
      i.assignee_user_id AS assigneeUserId, u.display_name AS assigneeDisplayName, i.product_id AS productId,
      p.name AS productName, i.created_at AS createdAt, i.updated_at AS updatedAt
    FROM inquiries i LEFT JOIN users u ON u.id = i.assignee_user_id LEFT JOIN products p ON p.id = i.product_id
    WHERE ${where.join(" AND ")} ORDER BY i.created_at DESC, i.id DESC LIMIT ? OFFSET ?`)
    .bind(...values, pageSize, (page - 1) * pageSize).all();
  const assignees = await db.prepare("SELECT id, display_name AS displayName, role FROM users WHERE is_active = 1 AND role IN ('admin', 'sales') ORDER BY display_name, id").all();
  const total = Number(count?.total ?? 0);
  return { items: rows.results, assignees: assignees.results, page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}

async function inquiryDetail(db: D1Database, id: string) {
  const row = await db.prepare(`SELECT i.*, p.name AS product_name, p.product_code, u.display_name AS assignee_display_name
    FROM inquiries i LEFT JOIN products p ON p.id = i.product_id LEFT JOIN users u ON u.id = i.assignee_user_id WHERE i.id = ? LIMIT 1`).bind(id).first<Record<string, unknown>>();
  if (!row) throw new HttpError("not_found", "Inquiry was not found.", 404);
  const [interests, notes] = await Promise.all([
    db.prepare("SELECT interest FROM inquiry_interests WHERE inquiry_id = ? ORDER BY interest").bind(id).all<{ interest: string }>(),
    db.prepare(`SELECT n.id, n.note, n.created_at AS createdAt, u.id AS authorId, u.display_name AS authorDisplayName
      FROM inquiry_notes n JOIN users u ON u.id = n.author_user_id WHERE n.inquiry_id = ? ORDER BY n.created_at, n.id`).bind(id).all<Record<string, unknown>>(),
  ]);
  return {
    id: row.id, inquiryType: row.inquiry_type, name: row.name, email: row.email, phone: row.phone, company: row.company,
    country: row.country, buyerType: row.buyer_type, message: row.message, sourceRoute: row.source_route, status: row.status,
    createdAt: row.created_at, updatedAt: row.updated_at,
    product: row.product_id ? { id: row.product_id, name: row.product_name, productCode: row.product_code } : null,
    assignee: row.assignee_user_id ? { id: row.assignee_user_id, displayName: row.assignee_display_name } : null,
    interests: interests.results.map((entry) => entry.interest),
    notes: notes.results.map((note) => ({ id: note.id, note: note.note, createdAt: note.createdAt, author: { id: note.authorId, displayName: note.authorDisplayName } })),
  };
}

async function mutateInquiry(db: D1Database, id: string, payload: z.infer<typeof payloadSchema>, actor: AuthUser) {
  const current = await db.prepare("SELECT id, status, updated_at AS updatedAt FROM inquiries WHERE id = ?").bind(id).first<InquiryRow>();
  if (!current) throw new HttpError("not_found", "Inquiry was not found.", 404);
  const now = nextTimestamp(current.updatedAt);
  let mutation: D1PreparedStatement;
  let action: string;
  let context: Record<string, unknown>;
  let noteResult: { note: string; author: { id: string; displayName: string }; createdAt: string } | undefined;

  if (payload.action === "assign") {
    if (payload.assigneeUserId) {
      const target = await db.prepare("SELECT id FROM users WHERE id = ? AND is_active = 1 AND role IN ('admin', 'sales')").bind(payload.assigneeUserId).first();
      if (!target) throw new HttpError("invalid_assignee", "Choose an active sales-capable user.", 422);
    }
    mutation = db.prepare("UPDATE inquiries SET assignee_user_id = ?, updated_at = ? WHERE id = ? AND updated_at = ?").bind(payload.assigneeUserId, now, id, payload.updatedAt);
    action = "assign";
    context = { assigneeUserId: payload.assigneeUserId };
  } else if (payload.action === "transition") {
    if (!transitions[current.status].includes(payload.status)) throw new HttpError("invalid_transition", `Inquiry cannot move from ${current.status} to ${payload.status}.`, 422);
    mutation = db.prepare("UPDATE inquiries SET status = ?, updated_at = ? WHERE id = ? AND updated_at = ?").bind(payload.status, now, id, payload.updatedAt);
    action = "transition";
    context = { from: current.status, to: payload.status };
  } else {
    const noteId = crypto.randomUUID();
    mutation = db.prepare("UPDATE inquiries SET updated_at = ? WHERE id = ? AND updated_at = ?").bind(now, id, payload.updatedAt);
    action = "note";
    context = { noteId };
    noteResult = { note: payload.note, author: { id: actor.id, displayName: actor.displayName }, createdAt: now };
    const [result] = await db.batch([
      mutation,
      db.prepare("INSERT INTO inquiry_notes (id, inquiry_id, author_user_id, note, created_at) SELECT ?, ?, ?, ?, ? WHERE changes() = 1").bind(noteId, id, actor.id, payload.note, now),
      audit(db, actor.id, action, "inquiry", id, context, now, true),
    ]);
    if (Number(result.meta?.changes ?? 0) !== 1) throw editConflict();
    return { ...(await inquiryDetail(db, id)), note: noteResult };
  }

  const [result] = await db.batch([mutation, audit(db, actor.id, action, "inquiry", id, context, now, true)]);
  if (Number(result.meta?.changes ?? 0) !== 1) throw editConflict();
  return inquiryDetail(db, id);
}

function audit(db: D1Database, actorId: string, action: string, entityType: string, entityId: string, context: object, timestamp: string, conditional: boolean) {
  return db.prepare(`INSERT INTO audit_logs (id, actor_user_id, action, entity_type, entity_id, context_text, created_at)
    SELECT ?, ?, ?, ?, ?, ?, ?${conditional ? " WHERE changes() = 1" : ""}`)
    .bind(crypto.randomUUID(), actorId, action, entityType, entityId, JSON.stringify(context), timestamp);
}

function addEnumFilter(search: URLSearchParams, key: string, allowed: readonly string[], column: string, where: string[], values: unknown[]) {
  const value = clean(search.get(key));
  if (!value) return;
  if (!allowed.includes(value)) throw new HttpError("invalid_filter", `Invalid ${key} filter.`, 422);
  where.push(`${column} = ?`);
  values.push(value);
}

function addDateRange(search: URLSearchParams, column: string, where: string[], values: unknown[]) {
  const from = clean(search.get("dateFrom"));
  const to = clean(search.get("dateTo"));
  if (from) { if (!validIsoDay(from)) throw new HttpError("invalid_filter", "Invalid start date.", 422); where.push(`${column} >= ?`); values.push(`${from}T00:00:00.000Z`); }
  if (to) { if (!validIsoDay(to)) throw new HttpError("invalid_filter", "Invalid end date.", 422); where.push(`${column} < ?`); values.push(new Date(new Date(`${to}T00:00:00.000Z`).getTime() + 86_400_000).toISOString()); }
}

function pagination(search: URLSearchParams) {
  const page = Math.max(1, Number.parseInt(search.get("page") ?? "1", 10) || 1);
  const pageSize = Math.min(100, Math.max(1, Number.parseInt(search.get("pageSize") ?? "20", 10) || 20));
  return { page, pageSize };
}

function clean(value: string | null): string | undefined { return value?.trim() || undefined; }
function validIsoDay(value: string): boolean { if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false; const date = new Date(`${value}T00:00:00.000Z`); return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value; }
function nextTimestamp(previous: string): string { const now = Date.now(); const old = Date.parse(previous); return new Date(Number.isFinite(old) && now <= old ? old + 1 : now).toISOString(); }
function editConflict() { return new HttpError("edit_conflict", "This record changed since you opened it. Reload before saving.", 409); }
function operationError(error: unknown, fallback: string): Response {
  if (error instanceof HttpError) return fail(error.code, error.message, error.status, error.fields);
  console.error(fallback, error);
  return fail("internal_error", fallback, 500);
}
