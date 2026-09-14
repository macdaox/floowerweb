import type { APIRoute } from "astro";
import { requireRole } from "../../../features/auth/authorize";
import {
  createAdminContent,
  getAdminContent,
  listAdminContent,
  parseActionPayload,
  parseCreatePayload,
  parseDeletePayload,
  parseUpdatePayload,
  transitionAdminContent,
  updateAdminContent,
  type AdminEntity,
} from "../../../features/content/admin";
import { HttpError } from "../../../lib/http/errors";
import { assertAllowedOrigin } from "../../../lib/http/origin";
import { parseJson } from "../../../lib/http/request";
import { fail, ok } from "../../../lib/http/result";

const BODY_LIMIT = 256_000;

export function contentRoute(entity: AdminEntity): { GET: APIRoute; POST: APIRoute; PUT: APIRoute; PATCH: APIRoute; DELETE: APIRoute } {
  const GET: APIRoute = async ({ request, locals, params }) => {
    try {
      requireRole(locals, ["admin", "editor"]);
      const id = params.id;
      return ok(!id || id === "list"
        ? await listAdminContent(locals.runtime.env.DB, entity, new URL(request.url).searchParams)
        : await getAdminContent(locals.runtime.env.DB, entity, id));
    } catch (error) {
      return errorResponse(error);
    }
  };

  const POST: APIRoute = async ({ request, locals, params }) => {
    try {
      const actor = requireRole(locals, ["admin", "editor"]);
      assertAllowedOrigin(request, new URL(request.url).origin);
      const raw = await parseJson<unknown>(request, BODY_LIMIT);
      if (!params.id || params.id === "new") return ok(await createAdminContent(locals.runtime.env.DB, entity, parseCreatePayload(entity, raw), actor), 201);
      if (isAction(raw)) {
        const payload = parseActionPayload(raw);
        return ok(await transitionAdminContent(locals.runtime.env.DB, entity, params.id, payload.action, actor, locals.runtime.env.SESSION_SECRET, payload.updatedAt));
      }
      const payload = parseUpdatePayload(entity, raw);
      return ok(await updateAdminContent(locals.runtime.env.DB, entity, params.id, payload.updatedAt, payload.data, actor));
    } catch (error) {
      return errorResponse(error);
    }
  };

  const update: APIRoute = async ({ request, locals, params }) => {
    try {
      const actor = requireRole(locals, ["admin", "editor"]);
      assertAllowedOrigin(request, new URL(request.url).origin);
      if (!params.id || params.id === "new" || params.id === "list") throw new HttpError("not_found", "A content id is required.", 404);
      const payload = parseUpdatePayload(entity, await parseJson<unknown>(request, BODY_LIMIT));
      return ok(await updateAdminContent(locals.runtime.env.DB, entity, params.id, payload.updatedAt, payload.data, actor));
    } catch (error) {
      return errorResponse(error);
    }
  };

  const DELETE: APIRoute = async ({ request, locals, params }) => {
    try {
      const actor = requireRole(locals, ["admin", "editor"]);
      assertAllowedOrigin(request, new URL(request.url).origin);
      if (!params.id || params.id === "new" || params.id === "list") throw new HttpError("not_found", "A content id is required.", 404);
      const payload = parseDeletePayload(await parseJson<unknown>(request, BODY_LIMIT));
      return ok(await transitionAdminContent(locals.runtime.env.DB, entity, params.id, "archive", actor, locals.runtime.env.SESSION_SECRET, payload.updatedAt));
    } catch (error) {
      return errorResponse(error);
    }
  };

  return { GET, POST, PUT: update, PATCH: update, DELETE };
}

function isAction(value: unknown): value is { action: unknown } {
  return Boolean(value && typeof value === "object" && !Array.isArray(value) && Object.prototype.hasOwnProperty.call(value, "action"));
}

function errorResponse(error: unknown): Response {
  if (error instanceof HttpError) return fail(error.code, error.message, error.status, error.fields);
  console.error("Admin content request failed", error);
  return fail("internal_error", "Unable to process this content request.", 500);
}
