import { HttpError } from "../../lib/http/errors";

const MAX_EMAIL_LENGTH = 254;
const MAX_PASSWORD_LENGTH = 1_024;

export type LoginInput = { email: string; password: string };

export function parseLoginInput(input: unknown): LoginInput {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw invalidCredentials();
  const { email, password } = input as Record<string, unknown>;
  if (typeof email !== "string" || typeof password !== "string") throw invalidCredentials();

  const normalizedEmail = email.trim().toLowerCase();
  if (!isEmail(normalizedEmail) || password.length === 0 || password.length > MAX_PASSWORD_LENGTH) throw invalidCredentials();
  return { email: normalizedEmail, password };
}

export function assertStrongAdminPassword(password: string): void {
  if (password.length < 15 || password.length > MAX_PASSWORD_LENGTH || password.trim().length < 15) {
    throw new Error("EVERSTEM_ADMIN_PASSWORD must be a passphrase of at least 15 non-whitespace characters.");
  }
}

export function invalidCredentials(): HttpError {
  return new HttpError("invalid_credentials", "Invalid email or password.", 401);
}

function isEmail(value: string): boolean {
  return value.length <= MAX_EMAIL_LENGTH && /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(value);
}
