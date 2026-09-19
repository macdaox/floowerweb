import type { APIRoute } from "astro";
import { z } from "zod";
import { requireRole } from "../../../../features/auth/authorize";
import { HttpError } from "../../../../lib/http/errors";
import { assertAllowedOrigin } from "../../../../lib/http/origin";
import { parseJson } from "../../../../lib/http/request";
import { fail, ok } from "../../../../lib/http/result";

const nullableText = z.string().trim().max(2_000).transform((value) => value || null);
const nullableEmail = z.string().trim().refine((value) => !value || z.string().email().safeParse(value).success, "Invalid email").transform((value) => value || null);
const nullableUrl = z.string().trim().refine((value) => !value || z.string().url().safeParse(value).success, "Invalid URL").transform((value) => value || null);
const dataSchema = z.object({
  companyName: z.string().trim().min(1).max(200).optional(), tagline: nullableText.optional(), companyDescription: nullableText.optional(),
  contactEmail: nullableEmail.optional(), instagramUrl: nullableUrl.optional(), pinterestUrl: nullableUrl.optional(), linkedinUrl: nullableUrl.optional(),
  defaultSeoTitle: nullableText.optional(), defaultSeoDescription: nullableText.optional(),
}).strict().refine((data) => Object.keys(data).length > 0);
const payloadSchema = z.object({ version: z.literal(1), updatedAt: z.string().datetime(), data: dataSchema }).strict();
const columns: Record<string, string> = {
  companyName: "company_name", tagline: "tagline", companyDescription: "company_description", contactEmail: "contact_email",
  instagramUrl: "instagram_url", pinterestUrl: "pinterest_url", linkedinUrl: "linkedin_url", defaultSeoTitle: "default_seo_title",
  defaultSeoDescription: "default_seo_description",
};

export const GET: APIRoute = async ({ locals }) => {
  try {
    requireRole(locals, ["admin"]);
    return ok(await readSettings(locals.runtime.env.DB));
  } catch (error) {
    return errorResponse(error, "Unable to load settings.");
  }
};

export const PUT: APIRoute = async ({ request, locals }) => {
  try {
    const actor = requireRole(locals, ["admin"]);
    assertAllowedOrigin(request, new URL(request.url).origin);
    const parsed = payloadSchema.safeParse(await parseJson<unknown>(request, 32_000));
    if (!parsed.success) throw new HttpError("invalid_payload", "The settings payload is invalid.", 422);
    const current = await readSettings(locals.runtime.env.DB);
    const timestamp = nextTimestamp(String(current.updatedAt));
    const entries = Object.entries(parsed.data.data);
    const [result] = await locals.runtime.env.DB.batch([
      locals.runtime.env.DB.prepare(`UPDATE settings SET ${entries.map(([field]) => `${columns[field]} = ?`).join(", ")}, updated_by_user_id = ?, updated_at = ? WHERE id = 'site' AND updated_at = ?`)
        .bind(...entries.map(([, value]) => value), actor.id, timestamp, parsed.data.updatedAt),
      locals.runtime.env.DB.prepare("INSERT INTO audit_logs (id, actor_user_id, action, entity_type, entity_id, context_text, created_at) SELECT ?, ?, 'update', 'settings', 'site', ?, ? WHERE changes() = 1")
        .bind(crypto.randomUUID(), actor.id, JSON.stringify({ fields: entries.map(([field]) => field) }), timestamp),
    ]);
    if (Number(result.meta?.changes ?? 0) !== 1) throw new HttpError("edit_conflict", "Settings changed since you opened them. Reload before saving.", 409);
    return ok(await readSettings(locals.runtime.env.DB));
  } catch (error) {
    return errorResponse(error, "Unable to save settings.");
  }
};

async function readSettings(db: D1Database) {
  const row = await db.prepare(`SELECT id, company_name AS companyName, tagline, company_description AS companyDescription,
    contact_email AS contactEmail, instagram_url AS instagramUrl, pinterest_url AS pinterestUrl, linkedin_url AS linkedinUrl,
    default_seo_title AS defaultSeoTitle, default_seo_description AS defaultSeoDescription,
    updated_by_user_id AS updatedByUserId, created_at AS createdAt, updated_at AS updatedAt FROM settings WHERE id = 'site'`).first();
  if (!row) throw new HttpError("not_found", "Site settings have not been initialized.", 404);
  return row;
}

function nextTimestamp(previous: string) { const now = Date.now(); const old = Date.parse(previous); return new Date(Number.isFinite(old) && now <= old ? old + 1 : now).toISOString(); }
function errorResponse(error: unknown, fallback: string) {
  if (error instanceof HttpError) return fail(error.code, error.message, error.status, error.fields);
  console.error(fallback, error);
  return fail("internal_error", fallback, 500);
}
