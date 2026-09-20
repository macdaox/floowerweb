import type { APIRoute } from "astro";
import { z } from "zod";
import { requireRole, type AuthUser } from "../../../../features/auth/authorize";
import { hashPassword } from "../../../../features/auth/password";
import { assertStrongAdminPassword } from "../../../../features/auth/schemas";
import { HttpError } from "../../../../lib/http/errors";
import { assertAllowedOrigin } from "../../../../lib/http/origin";
import { parseJson } from "../../../../lib/http/request";
import { fail, ok } from "../../../../lib/http/result";

const updateSchema = z.object({
  version: z.literal(1).optional(), action: z.literal("update"), updatedAt: z.string().datetime(),
  role: z.enum(["admin", "editor", "sales"]).optional(), isActive: z.boolean().optional(),
}).strict().refine((value) => value.role !== undefined || value.isActive !== undefined);
const resetSchema = z.object({
  version: z.literal(1).optional(), action: z.literal("resetPassword"), updatedAt: z.string().datetime(), password: z.string().min(12).max(256),
}).strict();
const createSchema = z.object({
  version: z.literal(1), action: z.literal("create"),
  email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
  username: z.string().trim().min(2).max(80).regex(/^[a-z0-9]+(?:[._-][a-z0-9]+)*$/u),
  displayName: z.string().trim().min(1).max(120), role: z.enum(["admin", "editor", "sales"]),
  password: z.string().max(1_024),
}).strict();
const payloadSchema = z.union([createSchema, updateSchema, resetSchema]);
type UserMutationPayload = z.infer<typeof updateSchema> | z.infer<typeof resetSchema>;
type UserRow = { id: string; role: "admin" | "editor" | "sales"; isActive: number | boolean; updatedAt: string };

export const GET: APIRoute = async ({ request, locals, params }) => {
  try {
    requireRole(locals, ["admin"]);
    const database = locals.runtime.env.DB;
    if (params.id && params.id !== "list") {
      const user = await readUser(database, params.id);
      if (!user) throw new HttpError("not_found", "User was not found.", 404);
      return ok(user);
    }
    const search = new URL(request.url).searchParams;
    const where = ["1 = 1"];
    const values: unknown[] = [];
    const role = search.get("role")?.trim();
    if (role) {
      if (!(["admin", "editor", "sales"] as const).includes(role as "admin" | "editor" | "sales")) throw new HttpError("invalid_filter", "Invalid role filter.", 422);
      where.push("role = ?"); values.push(role);
    }
    const active = search.get("active")?.trim();
    if (active) {
      if (!(["true", "false"] as const).includes(active as "true" | "false")) throw new HttpError("invalid_filter", "Invalid active filter.", 422);
      where.push("is_active = ?"); values.push(active === "true" ? 1 : 0);
    }
    const query = search.get("q")?.trim();
    if (query) { where.push("(email LIKE ? OR username LIKE ? OR display_name LIKE ?)"); values.push(`%${query}%`, `%${query}%`, `%${query}%`); }
    const rows = await database.prepare(`SELECT id, email, username, display_name AS displayName, role, is_active AS isActive,
      last_login_at AS lastLoginAt, created_at AS createdAt, updated_at AS updatedAt FROM users WHERE ${where.join(" AND ")} ORDER BY display_name, id`)
      .bind(...values).all<Record<string, unknown>>();
    return ok({ items: rows.results.map(mapUser), total: rows.results.length });
  } catch (error) {
    return errorResponse(error, "Unable to load users.");
  }
};

export const POST: APIRoute = async ({ request, locals, params }) => {
  try {
    const actor = requireRole(locals, ["admin"]);
    assertAllowedOrigin(request, new URL(request.url).origin);
    if (!params.id || params.id === "list") throw new HttpError("not_found", "A user id is required.", 404);
    const parsed = payloadSchema.safeParse(await parseJson<unknown>(request, 16_000));
    if (!parsed.success) throw new HttpError("invalid_payload", "The user operation is invalid.", 422);
    if (params.id === "new") {
      if (parsed.data.action !== "create") throw new HttpError("invalid_payload", "The user operation is invalid.", 422);
      return ok(await createUser(locals.runtime.env.DB, parsed.data, actor), 201);
    }
    if (parsed.data.action === "create") throw new HttpError("invalid_payload", "The user operation is invalid.", 422);
    const current = await locals.runtime.env.DB.prepare("SELECT id, role, is_active AS isActive, updated_at AS updatedAt FROM users WHERE id = ?").bind(params.id).first<UserRow>();
    if (!current) throw new HttpError("not_found", "User was not found.", 404);
    if (current.id === actor.id && parsed.data.action === "update" && (parsed.data.role && parsed.data.role !== "admin" || parsed.data.isActive === false)) {
      throw new HttpError("self_lockout", "You cannot remove your own administrator access.", 422);
    }
    return ok(await mutateUser(locals.runtime.env.DB, current, parsed.data, actor));
  } catch (error) {
    return errorResponse(error, "Unable to update this user.");
  }
};

async function createUser(db: D1Database, payload: z.infer<typeof createSchema>, actor: AuthUser) {
  try {
    assertStrongAdminPassword(payload.password);
  } catch {
    throw new HttpError("weak_password", "Use a passphrase with at least 15 non-whitespace characters.", 422, { password: "Use at least 15 non-whitespace characters." });
  }
  const id = crypto.randomUUID();
  const timestamp = new Date().toISOString();
  try {
    await db.batch([
      db.prepare(`INSERT INTO users (id, email, username, display_name, password_hash, role, is_active, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`)
        .bind(id, payload.email, payload.username, payload.displayName, await hashPassword(payload.password), payload.role, timestamp, timestamp),
      db.prepare(`INSERT INTO audit_logs (id, actor_user_id, action, entity_type, entity_id, context_text, created_at)
        VALUES (?, ?, 'create', 'user', ?, ?, ?)`)
        .bind(crypto.randomUUID(), actor.id, id, JSON.stringify({ email: payload.email, username: payload.username, role: payload.role }), timestamp),
    ]);
  } catch (error) {
    if (/UNIQUE constraint failed: users\.(?:email|username)/iu.test(error instanceof Error ? error.message : String(error))) {
      throw new HttpError("user_conflict", "A user with this email or username already exists.", 409, { email: "Use a unique email and username." });
    }
    throw error;
  }
  const created = await readUser(db, id);
  if (!created) throw new HttpError("not_found", "User was not found.", 404);
  return created;
}

async function mutateUser(db: D1Database, current: UserRow, payload: UserMutationPayload, actor: AuthUser) {
  const timestamp = nextTimestamp(current.updatedAt);
  const auditId = crypto.randomUUID();
  let mutation: D1PreparedStatement;
  let action: string;
  let context: object;
  if (payload.action === "resetPassword") {
    mutation = db.prepare("UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ? AND updated_at = ?")
      .bind(await hashPassword(payload.password), timestamp, current.id, payload.updatedAt);
    action = "reset_password";
    context = {};
  } else {
    const fields: string[] = [];
    const values: unknown[] = [];
    if (payload.role !== undefined) { fields.push("role = ?"); values.push(payload.role); }
    if (payload.isActive !== undefined) { fields.push("is_active = ?"); values.push(payload.isActive ? 1 : 0); }
    mutation = db.prepare(`UPDATE users SET ${fields.join(", ")}, updated_at = ? WHERE id = ? AND updated_at = ?
      AND NOT (role = 'admin' AND is_active = 1
        AND (COALESCE(?, role) <> 'admin' OR COALESCE(?, is_active) = 0)
        AND NOT EXISTS (SELECT 1 FROM users AS other WHERE other.id <> users.id AND other.role = 'admin' AND other.is_active = 1))`)
      .bind(...values, timestamp, current.id, payload.updatedAt, payload.role ?? null, payload.isActive === undefined ? null : payload.isActive ? 1 : 0);
    action = "update";
    context = { ...(payload.role !== undefined ? { role: payload.role } : {}), ...(payload.isActive !== undefined ? { isActive: payload.isActive } : {}) };
  }
  const [result] = await db.batch([
    mutation,
    db.prepare(`INSERT INTO audit_logs (id, actor_user_id, action, entity_type, entity_id, context_text, created_at)
      SELECT ?, ?, ?, 'user', ?, ?, ? WHERE changes() = 1`)
      .bind(auditId, actor.id, action, current.id, JSON.stringify(context), timestamp),
    db.prepare("DELETE FROM sessions WHERE user_id = ? AND ? = 1 AND EXISTS (SELECT 1 FROM audit_logs WHERE id = ?)")
      .bind(current.id, payload.action === "resetPassword" || payload.action === "update" && payload.isActive === false ? 1 : 0, auditId),
  ]);
  if (Number(result.meta?.changes ?? 0) !== 1) await throwUserWriteFailure(db, current, payload);
  const updated = await readUser(db, current.id);
  if (!updated) throw new HttpError("not_found", "User was not found.", 404);
  return updated;
}

async function throwUserWriteFailure(db: D1Database, attempted: UserRow, payload: UserMutationPayload): Promise<never> {
  const latest = await db.prepare("SELECT id, role, is_active AS isActive, updated_at AS updatedAt FROM users WHERE id = ?").bind(attempted.id).first<UserRow>();
  if (!latest) throw new HttpError("not_found", "User was not found.", 404);
  if (latest.updatedAt !== payload.updatedAt) throw editConflict();
  if (payload.action === "update" && isActiveAdmin(latest) && (payload.role !== undefined && payload.role !== "admin" || payload.isActive === false)) {
    const other = await db.prepare("SELECT id FROM users WHERE id <> ? AND role = 'admin' AND is_active = 1 LIMIT 1").bind(latest.id).first();
    if (!other) throw new HttpError("last_admin", "At least one active administrator is required.", 422);
  }
  throw editConflict();
}

async function readUser(db: D1Database, id: string) {
  const row = await db.prepare(`SELECT id, email, username, display_name AS displayName, role, is_active AS isActive,
    last_login_at AS lastLoginAt, created_at AS createdAt, updated_at AS updatedAt FROM users WHERE id = ?`).bind(id).first<Record<string, unknown>>();
  return row ? mapUser(row) : undefined;
}

function mapUser(row: Record<string, unknown>) { return { ...row, isActive: Boolean(row.isActive) }; }
function isActiveAdmin(user: UserRow) { return user.role === "admin" && Boolean(user.isActive); }
function nextTimestamp(previous: string) { const now = Date.now(); const old = Date.parse(previous); return new Date(Number.isFinite(old) && now <= old ? old + 1 : now).toISOString(); }
function editConflict() { return new HttpError("edit_conflict", "This user changed since you opened it. Reload before saving.", 409); }
function errorResponse(error: unknown, fallback: string) {
  if (error instanceof HttpError) return fail(error.code, error.message, error.status, error.fields);
  console.error(fallback, error);
  return fail("internal_error", fallback, 500);
}
