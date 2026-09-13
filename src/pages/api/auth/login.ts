import type { APIRoute } from "astro";
import { createDb } from "../../../lib/db/client";
import { HttpError } from "../../../lib/http/errors";
import { assertAllowedOrigin } from "../../../lib/http/origin";
import { consumeRateLimit } from "../../../lib/http/rate-limit";
import { parseJson } from "../../../lib/http/request";
import { fail, ok } from "../../../lib/http/result";
import { createSession, sessionCookie } from "../../../features/auth/session";
import { invalidCredentials, parseLoginInput } from "../../../features/auth/schemas";
import { authenticatePassword, recordAudit } from "../../../features/auth/service";

const LOGIN_LIMIT = 10;
const LOGIN_WINDOW_SECONDS = 15 * 60;

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    assertAllowedOrigin(request, new URL(request.url).origin);
    const db = createDb(locals.runtime.env.DB);
    const ipAddress = clientIp(request);
    if (!await consumeRateLimit(db, `auth:login:${ipAddress}`, LOGIN_LIMIT, LOGIN_WINDOW_SECONDS)) {
      return fail("too_many_requests", "Too many login attempts. Please try again later.", 429);
    }

    let input;
    try {
      input = parseLoginInput(await parseJson<unknown>(request, 4_096));
    } catch (error) {
      if (error instanceof HttpError && error.code === "origin_forbidden") throw error;
      throw invalidCredentials();
    }

    const user = await authenticatePassword(db, input.email, input.password);
    if (!user) throw invalidCredentials();

    const session = await createSession(db, user.id, { ipAddress, userAgent: request.headers.get("user-agent") });
    await recordAudit(db, user.id, "login", "user", user.id, { ipAddress });
    return withCookie(ok({ user }), sessionCookie(session.token, session.expiresAt));
  } catch (error) {
    return errorResponse(error);
  }
};

function clientIp(request: Request): string {
  return request.headers.get("cf-connecting-ip")?.trim() || "unknown";
}

function withCookie(response: Response, cookie: string): Response {
  response.headers.append("set-cookie", cookie);
  return response;
}

function errorResponse(error: unknown): Response {
  if (error instanceof HttpError) return fail(error.code, error.message, error.status, error.fields);
  return fail("internal_error", "Unable to process this request.", 500);
}
