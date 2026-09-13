import type { APIRoute } from "astro";
import { createDb } from "../../lib/db/client";
import { HttpError } from "../../lib/http/errors";
import { assertAllowedOrigin } from "../../lib/http/origin";
import { consumeRateLimit } from "../../lib/http/rate-limit";
import { parseJson } from "../../lib/http/request";
import { fail, ok } from "../../lib/http/result";
import { isHoneypotSubmission, parseIdempotencyKey, parseInquiryInput } from "../../features/inquiries/schemas";
import { findInquiryByIdempotencyKey } from "../../features/inquiries/repository";
import { createInquiry } from "../../features/inquiries/service";

const LIMIT = 5;
const WINDOW_SECONDS = 60 * 60;

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    assertAllowedOrigin(request, new URL(request.url).origin);
    const body = await parseJson<unknown>(request, 8_192);
    if (isHoneypotSubmission(body)) return new Response(null, { status: 204 });
    const db = locals.runtime.env.DB;
    const appDb = createDb(db);
    if (!await consumeRateLimit(appDb, `inquiries:${clientIp(request)}`, LIMIT, WINDOW_SECONDS)) {
      return fail("too_many_requests", "Too many enquiries. Please try again later.", 429);
    }
    const idempotencyKey = parseIdempotencyKey(request.headers.get("idempotency-key"));
    if (idempotencyKey) {
      const existing = await findInquiryByIdempotencyKey(db, idempotencyKey);
      if (existing) return ok(existing, 200);
    }
    return ok(await createInquiry(db, parseInquiryInput(body), { idempotencyKey }), 201);
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
