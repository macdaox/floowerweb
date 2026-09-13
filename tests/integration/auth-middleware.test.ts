import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Miniflare } from "miniflare";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("astro:middleware", () => ({ defineMiddleware: <T>(handler: T) => handler }));
import { createDb } from "../../src/lib/db/client";
import { hashPassword } from "../../src/features/auth/password";
import { createSession } from "../../src/features/auth/session";
import { onRequest } from "../../src/middleware";
import { POST as logout } from "../../src/pages/api/auth/logout";

const workspace = resolve(import.meta.dirname, "../..");
type MiddlewareLocals = {
  runtime: { env: { DB: D1Database; SESSION_SECRET: string } };
  auth?: { id: string; email: string; displayName: string; role: "admin" | "editor" | "sales" };
};

describe("authentication middleware", () => {
  let miniflare: Miniflare;
  let database: D1Database;

  beforeEach(async () => {
    miniflare = new Miniflare({ modules: true, script: "export default { fetch() { return new Response('ok'); } }", d1Databases: ["DB"] });
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

  it("loads a valid session into locals and renews only near expiry", async () => {
    const session = await createNearExpirySession();
    let observedUserId: string | undefined;

    const response = await invoke("https://everstem.test/admin", `everstem_session=${session.token}`, async (locals) => {
      observedUserId = locals.auth?.id;
      return new Response("ok");
    });

    expect(observedUserId).toBe("admin-1");
    expect(response.headers.get("set-cookie")).toContain("Max-Age=604800");
  });

  it("protects exact admin roots and descendants without intercepting similarly named public paths", async () => {
    await expectStatus("https://everstem.test/api/admin", 401);
    await expectStatus("https://everstem.test/api/admin/users", 401);
    const adminRoot = await invoke("https://everstem.test/admin", undefined, async () => new Response("next"));
    const adminChild = await invoke("https://everstem.test/admin/users", undefined, async () => new Response("next"));
    expect(adminRoot.status).toBe(302);
    expect(adminChild.status).toBe(302);

    await expectStatus("https://everstem.test/administration", 204);
    await expectStatus("https://everstem.test/api/administration", 204);
  });

  it("keeps a session intact when logout is cross-origin", async () => {
    const session = await createSession(createDb(database), "admin-1");
    const response = await invoke("https://everstem.test/api/auth/logout", `everstem_session=${session.token}`, async (locals, request) =>
      logout({ request: new Request(request, { method: "POST", headers: { origin: "https://evil.test", cookie: `everstem_session=${session.token}` } }), locals } as never),
    );

    expect(response.status).toBe(403);
    expect(await database.prepare("SELECT COUNT(*) AS count FROM sessions WHERE user_id = ?").bind("admin-1").first<{ count: number }>()).toEqual({ count: 1 });
  });

  it("does not append a renewal cookie after same-origin logout clears a near-expiry session", async () => {
    const session = await createNearExpirySession();
    const response = await invoke("https://everstem.test/api/auth/logout", `everstem_session=${session.token}`, async (locals, request) =>
      logout({ request: new Request(request, { method: "POST", headers: { origin: "https://everstem.test", cookie: `everstem_session=${session.token}` } }), locals } as never),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
    expect(response.headers.get("set-cookie")).not.toContain("Max-Age=604800");
    expect(await database.prepare("SELECT COUNT(*) AS count FROM sessions WHERE user_id = ?").bind("admin-1").first<{ count: number }>()).toEqual({ count: 0 });
  });

  async function createNearExpirySession() {
    const session = await createSession(createDb(database), "admin-1");
    await database.prepare("UPDATE sessions SET expires_at = ? WHERE user_id = ?").bind(new Date(Date.now() + 60 * 60 * 1_000).toISOString(), "admin-1").run();
    return session;
  }

  async function expectStatus(url: string, status: number): Promise<void> {
    const response = await invoke(url, undefined, async () => new Response(null, { status: 204 }));
    expect(response.status).toBe(status);
  }

  async function invoke(
    requestUrl: string,
    cookie: string | undefined,
    next: (locals: MiddlewareLocals, request: string) => Promise<Response>,
  ): Promise<Response> {
    const request = new Request(requestUrl, { headers: cookie ? { cookie } : undefined });
    const locals: MiddlewareLocals = { runtime: { env: { DB: database, SESSION_SECRET: "test-secret" } } };
    const response = await onRequest({ request, url: new URL(requestUrl), locals } as never, () => next(locals, requestUrl));
    if (!(response instanceof Response)) throw new Error("Middleware did not return a response.");
    return response;
  }
});

function now(): string {
  return "2026-09-13T00:00:00.000Z";
}

async function applyMigration(database: D1Database, source: string): Promise<void> {
  for (const statement of source.split(";").map((entry) => entry.trim()).filter(Boolean)) {
    await database.prepare(statement).run();
  }
}
