import type { APIRoute } from "astro";
import { createDb } from "../../lib/db/client";
import { HttpError } from "../../lib/http/errors";
import { assertAllowedOrigin } from "../../lib/http/origin";
import { consumeRateLimit } from "../../lib/http/rate-limit";
import { parseJson } from "../../lib/http/request";
import { fail, ok } from "../../lib/http/result";
import { isHoneypotSubmission, parseIdempotencyKey, parseSubscriberInput } from "../../features/inquiries/schemas";
import { findSubscriberByEmail, findSubscriberByIdempotencyKey } from "../../features/inquiries/repository";
import { subscribe } from "../../features/inquiries/service";

const LIMIT = 10;
const WINDOW_SECONDS = 60 * 60;

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    assertAllowedOrigin(request, new URL(request.url).origin);
    const body = await parseJson<unknown>(request, 2_048);
    if (isHoneypotSubmission(body)) return new Response(null, { status: 204 });
    const db = locals.runtime.env.DB;
    if (!await consumeRateLimit(createDb(db), `subscribers:${clientIp(request)}`, LIMIT, WINDOW_SECONDS)) {
      return fail("too_many_requests", "Too many subscription attempts. Please try again later.", 429);
    }
    const input = parseSubscriberInput(body);
    const idempotencyKey = parseIdempotencyKey(request.headers.get("idempotency-key"));
    const existing = idempotencyKey
      ? await findSubscriberByIdempotencyKey(db, idempotencyKey) ?? await findSubscriberByEmail(db, input.email)
      : await findSubscriberByEmail(db, input.email);
    return ok(await subscribe(db, input, { idempotencyKey }), existing ? 200 : 201);
  } catch (error) {
    return errorResponse(error);
  }
};

function clientIp(request: Request): string {
  return request.headers.get("cf-connecting-ip")?.trim() || "unknown";
}

function errorResponse(error: unknown): Response {
  if (error instanceof HttpError) return fail(error.code, error.message, error.status, error.fields);
  return fail("internal_error", "Unable to process this request.", 500);
}
