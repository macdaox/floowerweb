import type { Role } from "../../lib/db/types";
import { HttpError } from "../../lib/http/errors";

export type AuthUser = {
  id: string;
  email: string;
  displayName: string;
  role: Role;
};

export function requireRole(locals: { auth?: AuthUser }, allowed: Role[]): AuthUser {
  const user = locals.auth;
  if (!user) throw new HttpError("unauthorized", "Authentication is required.", 401);
  if (!allowed.includes(user.role)) throw new HttpError("forbidden", "You do not have permission to perform this action.", 403);
  return user;
}
