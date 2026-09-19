import type { APIRoute } from "astro";
import { requireRole } from "../../../../features/auth/authorize";
import { getMedia, updateMediaAltText } from "../../../../features/media/repository";
import { parseAltTextUpdate } from "../../../../features/media/schemas";
import { deleteMedia } from "../../../../features/media/service";
import { HttpError } from "../../../../lib/http/errors";
import { assertAllowedOrigin } from "../../../../lib/http/origin";
import { parseJson } from "../../../../lib/http/request";
import { fail, ok } from "../../../../lib/http/result";

export const GET: APIRoute = async ({ locals, params }) => {
  try {
    requireRole(locals, ["admin", "editor"]);
    return ok(await getMedia(locals.runtime.env.DB, requiredId(params.id)));
  } catch (error) {
    return errorResponse(error);
  }
};

export const PATCH: APIRoute = async ({ request, locals, params }) => {
  try {
    requireRole(locals, ["admin", "editor"]);
    assertAllowedOrigin(request, new URL(request.url).origin);
    const payload = parseAltTextUpdate(await parseJson<unknown>(request, 16_000));
    return ok(await updateMediaAltText(locals.runtime.env.DB, requiredId(params.id), payload.altText));
  } catch (error) {
    return errorResponse(error);
  }
};

export const DELETE: APIRoute = async ({ request, locals, params }) => {
  try {
    const actor = requireRole(locals, ["admin", "editor"]);
    assertAllowedOrigin(request, new URL(request.url).origin);
    return ok(await deleteMedia(locals.runtime.env, requiredId(params.id), actor.id));
  } catch (error) {
    return errorResponse(error);
  }
};

function requiredId(id: string | undefined): string {
  if (!id) throw new HttpError("not_found", "A media id is required.", 404);
  return id;
}

function errorResponse(error: unknown): Response {
  if (error instanceof HttpError) return fail(error.code, error.message, error.status, error.fields);
  console.error("Admin media record request failed", error);
  return fail("internal_error", "Unable to process this media request.", 500);
}
