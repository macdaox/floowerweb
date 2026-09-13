import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Miniflare } from "miniflare";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDb } from "../../src/lib/db/client";
import { hashPassword } from "../../src/features/auth/password";
import { createSession, renewSessionIfNeeded } from "../../src/features/auth/session";
import { POST as login } from "../../src/pages/api/auth/login";
import { POST as logout } from "../../src/pages/api/auth/logout";

const workspace = resolve(import.meta.dirname, "../..");

describe("authentication API", () => {
  let miniflare: Miniflare;
  let database: D1Database;

  beforeEach(async () => {
    miniflare = new Miniflare({
      modules: true,
      script: "export default { fetch() { return new Response('ok'); } }",
      d1Databases: ["DB"],
    });
    database = await miniflare.getD1Database("DB") as unknown as D1Database;
    for (const name of ["0001_initial.sql", "0002_schema_normalization.sql", "0003_rate_limits.sql"]) {
      await applyMigration(database, await readFile(resolve(workspace, "migrations", name), "utf8"));
    }
    await database.prepare(`INSERT INTO users (id, email, username, display_name, password_hash, role, is_active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'admin', 1, ?, ?)`)
      .bind("admin-1", "admin@example.com", "admin", "Administrator", await hashPassword("correct horse battery staple"), now(), now())
      .run();
  });

  afterEach(async () => {
    await miniflare.dispose();
  });

  it("creates an opaque, secure session cookie and retains only its digest", async () => {
    const response = await login({
      request: request("/api/auth/login", { email: "admin@example.com", password: "correct horse battery staple" }),
      locals: locals(database),
    } as never);

    expect(response.status).toBe(200);
    const cookie = response.headers.get("set-cookie");
    expect(cookie).toMatch(/^everstem_session=[A-Za-z0-9_-]+;/);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Path=/");
    expect(cookie).toContain("Max-Age=604800");

    const token = cookie?.match(/^everstem_session=([^;]+)/)?.[1];
    expect(token).toHaveLength(43);
    const session = await database.prepare("SELECT token_digest FROM sessions WHERE user_id = ?").bind("admin-1").first<{ token_digest: string }>();
    expect(session?.token_digest).toBe(Buffer.from(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token))).toString("base64url"));
    expect(await response.json()).toEqual({
      ok: true,
      data: { user: { id: "admin-1", email: "admin@example.com", displayName: "Administrator", role: "admin" } },
    });
  });

  it("uses the same invalid-credentials response for unknown users and bad passwords", async () => {
    const unknown = await login({
      request: request("/api/auth/login", { email: "missing@example.com", password: "correct horse battery staple" }),
      locals: locals(database),
    } as never);
    const wrongPassword = await login({
      request: request("/api/auth/login", { email: "admin@example.com", password: "wrong password" }),
      locals: locals(database),
    } as never);

    expect(unknown.status).toBe(401);
    expect(wrongPassword.status).toBe(401);
    await expect(unknown.json()).resolves.toEqual(await wrongPassword.json());
  });

  it("rejects cross-origin login and removes the session during same-origin logout", async () => {
    const badOrigin = await login({
      request: new Request("https://everstem.test/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json", origin: "https://evil.test" },
        body: JSON.stringify({ email: "admin@example.com", password: "correct horse battery staple" }),
      }),
      locals: locals(database),
    } as never);
    expect(badOrigin.status).toBe(403);

    const loggedIn = await login({
      request: request("/api/auth/login", { email: "admin@example.com", password: "correct horse battery staple" }),
      locals: locals(database),
    } as never);
    const token = loggedIn.headers.get("set-cookie")?.match(/^everstem_session=([^;]+)/)?.[1];
    const loggedOut = await logout({
      request: new Request("https://everstem.test/api/auth/logout", { method: "POST", headers: { origin: "https://everstem.test", cookie: `everstem_session=${token}` } }),
      locals: { ...locals(database), auth: { id: "admin-1", email: "admin@example.com", displayName: "Administrator", role: "admin" } },
    } as never);

    expect(loggedOut.status).toBe(200);
    expect(loggedOut.headers.get("set-cookie")).toContain("Max-Age=0");
    expect(await database.prepare("SELECT COUNT(*) AS count FROM sessions WHERE user_id = ?").bind("admin-1").first<{ count: number }>()).toEqual({ count: 0 });
    const audits = await database.prepare("SELECT action, context_text FROM audit_logs ORDER BY created_at").all<{ action: string; context_text: string | null }>();
    expect(audits.results).toEqual([
      { action: "login", context_text: '{"ipAddress":"198.51.100.10"}' },
      { action: "logout", context_text: null },
    ]);
  });

  it("renews a session only in its final day", async () => {
    const db = createDb(database);
    const session = await createSession(db, "admin-1");

    await expect(renewSessionIfNeeded(db, session.token, session.expiresAt)).resolves.toBeUndefined();
    const nearExpiry = new Date(Date.now() + 60 * 60 * 1_000).toISOString();
    await database.prepare("UPDATE sessions SET expires_at = ? WHERE user_id = ?").bind(nearExpiry, "admin-1").run();
    const renewed = await renewSessionIfNeeded(db, session.token, nearExpiry);

    expect(renewed).toBeTruthy();
    expect(new Date(renewed ?? "").getTime()).toBeGreaterThan(new Date(nearExpiry).getTime());
  });

  it("enforces D1-backed login limits before expensive password verification", async () => {
    let response: Response | undefined;
    for (let attempt = 0; attempt < 11; attempt += 1) {
      response = await login({
        request: new Request("https://everstem.test/api/auth/login", {
          method: "POST",
          headers: { "content-type": "application/json", origin: "https://everstem.test", "cf-connecting-ip": "203.0.113.9" },
          body: "not json",
        }),
        locals: locals(database),
      } as never);
    }

    expect(response?.status).toBe(429);
  });
});

function locals(database: D1Database) {
  return { runtime: { env: { DB: database, SESSION_SECRET: "test-secret" } }, db: createDb(database) };
}

function request(path: string, body: object): Request {
  return new Request(`https://everstem.test${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://everstem.test", "cf-connecting-ip": "198.51.100.10" },
    body: JSON.stringify(body),
  });
}

function now(): string {
  return "2026-09-13T00:00:00.000Z";
}

async function applyMigration(database: D1Database, source: string): Promise<void> {
  for (const statement of source.split(";").map((entry) => entry.trim()).filter(Boolean)) {
    await database.prepare(statement).run();
  }
}
