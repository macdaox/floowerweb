import type { APIRoute } from "astro";
import { createDb } from "../../../lib/db/client";
import { HttpError } from "../../../lib/http/errors";
import { assertAllowedOrigin } from "../../../lib/http/origin";
import { fail, ok } from "../../../lib/http/result";
import { deleteSession, expiredSessionCookie, readSessionCookie } from "../../../features/auth/session";
import { recordAudit } from "../../../features/auth/service";

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    assertAllowedOrigin(request, new URL(request.url).origin);
    const db = createDb(locals.runtime.env.DB);
    await deleteSession(db, readSessionCookie(request.headers.get("cookie")));
    if (locals.auth) await recordAudit(db, locals.auth.id, "logout", "user", locals.auth.id);
    const response = ok({});
    response.headers.append("set-cookie", expiredSessionCookie());
    return response;
  } catch (error) {
    if (error instanceof HttpError) return fail(error.code, error.message, error.status, error.fields);
    return fail("internal_error", "Unable to process this request.", 500);
  }
};
