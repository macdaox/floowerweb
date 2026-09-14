import type { APIRoute } from "astro";
import { createDb } from "../../lib/db/client";
import { HttpError } from "../../lib/http/errors";
import { assertAllowedOrigin } from "../../lib/http/origin";
import { consumeRateLimit } from "../../lib/http/rate-limit";
import { parseForm, parseJson } from "../../lib/http/request";
import { fail, ok } from "../../lib/http/result";
import { findSubmissionKey } from "../../features/inquiries/repository";
import { inquiryPayloadHash, createInquiry } from "../../features/inquiries/service";
import { isHoneypotSubmission, parseIdempotencyKey, parseInquiryInput } from "../../features/inquiries/schemas";

const LIMIT = 5;
const WINDOW_SECONDS = 60 * 60;

export const POST: APIRoute = async ({ request, locals }) => {
  const native = isNativeForm(request);
  try {
    assertAllowedOrigin(request, new URL(request.url).origin);
    const body = native ? inquiryFormInput(await parseForm(request, 8_192), request) : await parseJson<unknown>(request, 8_192);
    if (isHoneypotSubmission(body)) return new Response(null, { status: 204 });
    const input = parseInquiryInput(body);
    const idempotencyKey = parseIdempotencyKey(request.headers.get("idempotency-key"));
    const payloadHash = idempotencyKey ? await inquiryPayloadHash(input) : undefined;
    const db = locals.runtime.env.DB;
    if (idempotencyKey) {
      const existing = await findSubmissionKey(db, idempotencyKey);
      if (existing?.submissionType === "inquiry" && existing.payloadHash === payloadHash && existing.inquiryId) {
        return responseFor(request, native, input.sourceRoute, "inquiry", ok({ id: existing.inquiryId, status: "new" }, 200));
      }
      if (existing) throw new HttpError("idempotency_conflict", "This idempotency key was already used for a different submission.", 409);
    }
    if (!await consumeRateLimit(createDb(db), `inquiries:${clientIp(request)}`, LIMIT, WINDOW_SECONDS)) {
      return errorResponse(new HttpError("too_many_requests", "Too many enquiries. Please try again later.", 429), native);
    }
    const inquiry = await createInquiry(db, input, { idempotencyKey, payloadHash });
    return responseFor(request, native, input.sourceRoute, "inquiry", ok(inquiry, 201));
  } catch (error) {
    return errorResponse(error, native);
  }
};

function inquiryFormInput(form: FormData, request: Request): unknown {
  const interest = text(form.get("product_interest"));
  const productId = text(form.get("product_id"));
  const buyerType = text(form.get("buyer_type"));
  const sourceRoute = text(form.get("source_route")) || referrerRoute(request);
  return {
    inquiryType: text(form.get("inquiry_type")) || (productId ? "product" : buyerType ? "catalog" : "contact"), name: text(form.get("name")), email: text(form.get("email")), phone: text(form.get("phone")),
    company: text(form.get("company")), country: text(form.get("country")), buyerType,
    interests: interest ? [interest] : form.getAll("interests").map(text).filter(Boolean), message: text(form.get("message")),
    productId, sourceRoute, website: text(form.get("website")),
  };
}

function responseFor(request: Request, native: boolean, sourceRoute: string, submitted: string, json: Response): Response {
  if (!native) return json;
  return Response.redirect(new URL(`${sourceRoute}?submitted=${submitted}`, request.url), 303);
}

function isNativeForm(request: Request): boolean { return /^(application\/x-www-form-urlencoded|multipart\/form-data)(?:;|$)/i.test(request.headers.get("content-type") ?? ""); }
function text(value: FormDataEntryValue | null): string { return typeof value === "string" ? value : ""; }
function referrerRoute(request: Request): string { try { return new URL(request.headers.get("referer") ?? request.url).pathname; } catch { return "/"; } }
function clientIp(request: Request): string { return request.headers.get("cf-connecting-ip")?.trim() || "unknown"; }
function errorResponse(error: unknown, native: boolean): Response {
  if (error instanceof HttpError) return native ? new Response(`<main><h1>We could not send your enquiry.</h1><p>${error.message}</p><a href="/">Return to EVERSTEM</a></main>`, { status: error.status, headers: { "content-type": "text/html; charset=utf-8" } }) : fail(error.code, error.message, error.status, error.fields);
  return native ? new Response("<main><h1>We could not send your enquiry.</h1><a href=\"/\">Return to EVERSTEM</a></main>", { status: 500, headers: { "content-type": "text/html; charset=utf-8" } }) : fail("internal_error", "Unable to process this request.", 500);
}
