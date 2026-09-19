import type { APIRoute } from "astro";
import { requireRole } from "../../../../features/auth/authorize";
import { getGallery, listMedia, replaceGallery } from "../../../../features/media/repository";
import { parseAltText, parseGalleryPayload, parseMediaListQuery, type GalleryEntity } from "../../../../features/media/schemas";
import { mediaByteLimit, uploadMedia } from "../../../../features/media/service";
import { HttpError } from "../../../../lib/http/errors";
import { assertAllowedOrigin } from "../../../../lib/http/origin";
import { parseForm, parseJson } from "../../../../lib/http/request";
import { fail, ok } from "../../../../lib/http/result";

const MULTIPART_OVERHEAD_BYTES = 64 * 1024;

export const GET: APIRoute = async ({ request, locals }) => {
  try {
    requireRole(locals, ["admin", "editor"]);
    const query = new URL(request.url).searchParams;
    const entity = query.get("entity");
    const contentId = query.get("contentId");
    if (entity || contentId) {
      if ((entity !== "product" && entity !== "space") || !contentId) throw new HttpError("invalid_query", "A valid gallery entity and content id are required.", 422);
      return ok(await getGallery(locals.runtime.env.DB, entity as GalleryEntity, contentId));
    }
    const parsed = parseMediaListQuery(query);
    return ok(await listMedia(locals.runtime.env.DB, parsed.search, parsed.page, parsed.pageSize));
  } catch (error) {
    return errorResponse(error);
  }
};

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const actor = requireRole(locals, ["admin", "editor"]);
    assertAllowedOrigin(request, new URL(request.url).origin);
    const form = await parseForm(request, mediaByteLimit(locals.runtime.env) + MULTIPART_OVERHEAD_BYTES);
    const file = form.get("file");
    if (!isFile(file)) throw new HttpError("invalid_payload", "Choose an image to upload.", 422, { file: "Choose an image." });
    const altText = parseAltText(form.get("altText"));
    return ok(await uploadMedia(locals.runtime.env, file, { altText, createdByUserId: actor.id }), 201);
  } catch (error) {
    return errorResponse(error);
  }
};

export const PUT: APIRoute = async ({ request, locals }) => {
  try {
    const actor = requireRole(locals, ["admin", "editor"]);
    assertAllowedOrigin(request, new URL(request.url).origin);
    const payload = parseGalleryPayload(await parseJson<unknown>(request, 128_000));
    return ok(await replaceGallery(locals.runtime.env.DB, payload.entity, payload.contentId, payload.items, actor.id));
  } catch (error) {
    return errorResponse(error);
  }
};

function isFile(value: FormDataEntryValue | null): value is File {
  return Boolean(value && typeof value !== "string" && typeof value.arrayBuffer === "function" && typeof value.name === "string");
}

function errorResponse(error: unknown): Response {
  if (error instanceof HttpError) return fail(error.code, error.message, error.status, error.fields);
  console.error("Admin media request failed", error);
  return fail("internal_error", "Unable to process this media request.", 500);
}
