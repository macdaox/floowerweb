import type { APIRoute } from "astro";
import { immutableMediaKeyPattern } from "../../features/media/schemas";

const CACHE_CONTROL = "public, max-age=31536000, immutable";

export const GET: APIRoute = async ({ request, locals, params }) => {
  const key = params.key;
  if (!key || !immutableMediaKeyPattern.test(key)) return new Response("Not found", { status: 404 });
  const object = await locals.runtime.env.MEDIA.get(key);
  if (!object) return new Response("Not found", { status: 404 });
  const etag = object.httpEtag;
  const headers = new Headers({
    "cache-control": CACHE_CONTROL,
    "content-type": object.httpMetadata?.contentType ?? contentTypeForKey(key),
    "etag": etag,
    "x-content-type-options": "nosniff",
  });
  if (request.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers });
  return new Response(object.body, { status: 200, headers });
};

function contentTypeForKey(key: string): string {
  if (key.endsWith(".jpg")) return "image/jpeg";
  if (key.endsWith(".png")) return "image/png";
  if (key.endsWith(".webp")) return "image/webp";
  return "image/avif";
}
