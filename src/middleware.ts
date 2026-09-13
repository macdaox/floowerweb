import { defineMiddleware } from "astro:middleware";
import { createDb } from "./lib/db/client";
import { fail } from "./lib/http/result";
import { findSession, readSessionCookie, renewSessionIfNeeded, sessionCookie } from "./features/auth/session";

export const onRequest = defineMiddleware(async (context, next) => {
  const token = readSessionCookie(context.request.headers.get("cookie"));
  if (token) {
    const db = createDb(context.locals.runtime.env.DB);
    const session = await findSession(db, token);
    if (session) {
      context.locals.auth = session.user;
      const refreshedExpiry = await renewSessionIfNeeded(db, token, session.expiresAt);
      const response = await next();
      if (refreshedExpiry) response.headers.append("set-cookie", sessionCookie(token, refreshedExpiry));
      return response;
    }
  }

  const path = context.url.pathname;
  if (path.startsWith("/api/admin/")) return fail("unauthorized", "Authentication is required.", 401);
  if (path.startsWith("/admin") && path !== "/admin/login") return Response.redirect(new URL("/admin/login", context.url), 302);
  return next();
});
