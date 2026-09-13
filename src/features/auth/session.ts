import { sql } from "drizzle-orm";
import type { AppDb, Role } from "../../lib/db/types";
import type { AuthUser } from "./authorize";

export const SESSION_COOKIE = "everstem_session";
export const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;
const SESSION_TTL_MS = SESSION_TTL_SECONDS * 1_000;
const RENEWAL_WINDOW_MS = 24 * 60 * 60 * 1_000;

type SessionMetadata = { ipAddress?: string; userAgent?: string | null };

type SessionRow = {
  session_id: string;
  expires_at: string;
  id: string;
  email: string;
  display_name: string;
  role: Role;
};

export async function createSession(
  db: AppDb,
  userId: string,
  metadata: SessionMetadata = {},
): Promise<{ token: string; expiresAt: string }> {
  const token = randomToken();
  const digest = await tokenDigest(token);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS).toISOString();
  await db.run(sql`
    INSERT INTO sessions (id, token_digest, user_id, expires_at, ip_address, user_agent, created_at)
    VALUES (${crypto.randomUUID()}, ${digest}, ${userId}, ${expiresAt}, ${metadata.ipAddress ?? null}, ${metadata.userAgent ?? null}, ${now.toISOString()})
  `);
  return { token, expiresAt };
}

export async function findSession(db: AppDb, token: string | undefined): Promise<{ user: AuthUser; expiresAt: string } | undefined> {
  if (!token || !/^[A-Za-z0-9_-]{43}$/u.test(token)) return undefined;
  const digest = await tokenDigest(token);
  const row = await db.get<SessionRow>(sql`
    SELECT sessions.id AS session_id, sessions.expires_at, users.id, users.email, users.display_name, users.role
    FROM sessions
    JOIN users ON users.id = sessions.user_id
    WHERE sessions.token_digest = ${digest} AND sessions.expires_at > ${new Date().toISOString()} AND users.is_active = 1
    LIMIT 1
  `);
  if (!row) return undefined;
  return { user: { id: row.id, email: row.email, displayName: row.display_name, role: row.role }, expiresAt: row.expires_at };
}

export async function renewSessionIfNeeded(db: AppDb, token: string, expiresAt: string): Promise<string | undefined> {
  const expiration = new Date(expiresAt).getTime();
  if (!Number.isFinite(expiration) || expiration - Date.now() > RENEWAL_WINDOW_MS) return undefined;
  const nextExpiry = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  await db.run(sql`UPDATE sessions SET expires_at = ${nextExpiry} WHERE token_digest = ${await tokenDigest(token)}`);
  return nextExpiry;
}

export async function deleteSession(db: AppDb, token: string | undefined): Promise<void> {
  if (!token || !/^[A-Za-z0-9_-]{43}$/u.test(token)) return;
  await db.run(sql`DELETE FROM sessions WHERE token_digest = ${await tokenDigest(token)}`);
}

export function readSessionCookie(cookie: string | null): string | undefined {
  if (!cookie) return undefined;
  return cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${SESSION_COOKIE}=`))?.slice(SESSION_COOKIE.length + 1);
}

export function sessionCookie(token: string, _expiresAt: string): string {
  return `${SESSION_COOKIE}=${token}; Max-Age=${SESSION_TTL_SECONDS}; HttpOnly; Secure; SameSite=Lax; Path=/`;
}

export function expiredSessionCookie(): string {
  return `${SESSION_COOKIE}=; Max-Age=0; HttpOnly; Secure; SameSite=Lax; Path=/`;
}

async function tokenDigest(token: string): Promise<string> {
  return toBase64Url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token))));
}

function randomToken(): string {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(32)));
}

function toBase64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}
