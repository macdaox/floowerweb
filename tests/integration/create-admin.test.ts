import { execFileSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const workspace = resolve(import.meta.dirname, "../..");
const password = "a long local-only admin passphrase";

describe("administrator initialization", () => {
  let directory: string;
  let configPath: string;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "everstem-admin-cli-"));
    configPath = join(directory, "wrangler.toml");
    await writeFile(configPath, `name = "everstem-admin-cli-test"
compatibility_date = "2026-07-30"

[[d1_databases]]
binding = "DB"
database_name = "everstem-admin-cli-${Date.now()}"
database_id = "00000000-0000-0000-0000-000000000000"
migrations_dir = "${resolve(workspace, "migrations")}"\n`);
    runNpm(["exec", "wrangler", "--", "d1", "migrations", "apply", "DB", "--local", "--config", configPath]);
  }, 30_000);

  afterEach(async () => {
    await rm(directory, { force: true, recursive: true });
  });

  it("creates exactly one active administrator without exposing the configured password", () => {
    const output = runNpm(["run", "admin:create", "--", "--email", "admin@example.com", "--config", configPath, "--database", "DB"], {
      EVERSTEM_ADMIN_PASSWORD: password,
    });
    const users = query("SELECT email, password_hash, role, is_active FROM users");

    expect(output).not.toContain(password);
    expect(users).toEqual([{ email: "admin@example.com", password_hash: expect.not.stringContaining(password), role: "admin", is_active: 1 }]);
    expect(() => runNpm(["run", "admin:create", "--", "--email", "admin@example.com", "--config", configPath, "--database", "DB"], {
      EVERSTEM_ADMIN_PASSWORD: password,
    })).toThrow(/administrator with that email already exists/i);
    expect(() => runNpm(["run", "admin:create", "--", "--email", "another-admin@example.com", "--config", configPath, "--database", "DB"], {
      EVERSTEM_ADMIN_PASSWORD: password,
    })).toThrow(/administrator already exists/i);
  }, 30_000);

  it("refuses a passphrase with fewer than fifteen non-whitespace characters", () => {
    expect(() => runNpm(["run", "admin:create", "--", "--email", "admin@example.com", "--config", configPath, "--database", "DB"], {
      EVERSTEM_ADMIN_PASSWORD: "a             b",
    })).toThrow(/at least 15 non-whitespace/i);
    expect(query("SELECT COUNT(*) AS count FROM users")).toEqual([{ count: 0 }]);
  }, 30_000);

  function query(sql: string): Array<Record<string, unknown>> {
    return JSON.parse(runNpm(["exec", "wrangler", "--", "d1", "execute", "DB", "--local", "--config", configPath, "--command", sql, "--json"]))[0].results;
  }
});

function runNpm(args: string[], environment: Record<string, string | undefined> = {}): string {
  try {
    return execFileSync("npm", args, {
      cwd: workspace,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, ...environment },
    });
  } catch (error) {
    const failed = error as { stderr?: string; stdout?: string };
    throw new Error(`${failed.stdout ?? ""}${failed.stderr ?? ""}`);
  }
}
