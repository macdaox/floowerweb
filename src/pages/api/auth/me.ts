import type { APIRoute } from "astro";
import { HttpError } from "../../../lib/http/errors";
import { fail, ok } from "../../../lib/http/result";
import { requireRole } from "../../../features/auth/authorize";

export const GET: APIRoute = ({ locals }) => {
  try {
    return ok({ user: requireRole(locals, ["admin", "editor", "sales"]) });
  } catch (error) {
    if (error instanceof HttpError) return fail(error.code, error.message, error.status, error.fields);
    return fail("internal_error", "Unable to process this request.", 500);
  }
};
