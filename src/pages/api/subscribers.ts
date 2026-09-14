import type { APIRoute } from "astro";
import { createDb } from "../../lib/db/client";
import { HttpError } from "../../lib/http/errors";
import { assertAllowedOrigin } from "../../lib/http/origin";
import { consumeRateLimit } from "../../lib/http/rate-limit";
import { parseForm, parseJson } from "../../lib/http/request";
import { fail, ok } from "../../lib/http/result";
import { findSubmissionKey, findSubscriberByEmail } from "../../features/inquiries/repository";
import { subscriberPayloadHash, subscribe } from "../../features/inquiries/service";
import { isHoneypotSubmission, parseIdempotencyKey, parseSubscriberInput } from "../../features/inquiries/schemas";

const LIMIT = 10;
const WINDOW_SECONDS = 60 * 60;

export const POST: APIRoute = async ({ request, locals }) => {
  let native = false;
  try {
    assertAllowedOrigin(request, new URL(request.url).origin);
    native = isNativeForm(request);
    const body = native ? subscriberFormInput(await parseForm(request, 2_048)) : await parseJson<unknown>(request, 2_048);
    if (isHoneypotSubmission(body)) return new Response(null, { status: 204 });
    const input = parseSubscriberInput(body);
    const idempotencyKey = parseIdempotencyKey(request.headers.get("idempotency-key"));
    const payloadHash = idempotencyKey ? await subscriberPayloadHash(input) : undefined;
    const db = locals.runtime.env.DB;
    if (idempotencyKey) {
      const existing = await findSubmissionKey(db, idempotencyKey);
      if (existing?.submissionType === "subscriber" && existing.payloadHash === payloadHash && existing.subscriberId) {
        return responseFor(request, native, input.source, ok({ subscribed: true }, 200));
      }
      if (existing) throw new HttpError("idempotency_conflict", "This idempotency key was already used for a different submission.", 409);
    }
    if (!await consumeRateLimit(createDb(db), `subscribers:${clientIp(request)}`, LIMIT, WINDOW_SECONDS)) {
      return fail("too_many_requests", "Too many subscription attempts. Please try again later.", 429);
    }
    const existingSubscriber = await findSubscriberByEmail(db, input.email);
    return responseFor(request, native, input.source, ok(await subscribe(db, input, { idempotencyKey, payloadHash }), existingSubscriber ? 200 : 201));
  } catch (error) {
    if (error instanceof HttpError) return native ? new Response(`<main><h1>We could not subscribe you.</h1><p>${error.message}</p><a href="/">Return to EVERSTEM</a></main>`, { status: error.status, headers: { "content-type": "text/html; charset=utf-8" } }) : fail(error.code, error.message, error.status, error.fields);
    return native ? new Response("<main><h1>We could not subscribe you.</h1><a href=\"/\">Return to EVERSTEM</a></main>", { status: 500, headers: { "content-type": "text/html; charset=utf-8" } }) : fail("internal_error", "Unable to process this request.", 500);
  }
};

function subscriberFormInput(form: FormData): unknown { return { email: text(form.get("email")), source: text(form.get("source")), website: text(form.get("website")) }; }
function responseFor(request: Request, native: boolean, source: string, json: Response): Response { return native ? Response.redirect(new URL(`${source}?submitted=subscriber`, request.url), 303) : json; }
function isNativeForm(request: Request): boolean { return /^(application\/x-www-form-urlencoded|multipart\/form-data)(?:;|$)/i.test(request.headers.get("content-type") ?? ""); }
function text(value: FormDataEntryValue | null): string { return typeof value === "string" ? value : ""; }
function clientIp(request: Request): string { return request.headers.get("cf-connecting-ip")?.trim() || "unknown"; }
