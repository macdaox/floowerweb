import { execFileSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { hashPassword } from "../../src/features/auth/password";

const E2E_USERS = [
  { id: "e2e-admin", email: "e2e-admin@everstem.test", username: "e2e-admin", displayName: "E2E Admin", role: "admin" },
  { id: "e2e-editor", email: "e2e-editor@everstem.test", username: "e2e-editor", displayName: "E2E Editor", role: "editor" },
  { id: "e2e-sales", email: "e2e-sales@everstem.test", username: "e2e-sales", displayName: "E2E Sales", role: "sales" },
] as const;

export default async function globalSetup(): Promise<void> {
  const password = process.env.E2E_ADMIN_PASSWORD;
  if (!password) throw new Error("E2E_ADMIN_PASSWORD must be set for authenticated browser tests.");

  const directory = await mkdtemp(join(tmpdir(), "everstem-e2e-"));
  const sqlFile = join(directory, "fixtures.sql");
  try {
    exec("d1", "migrations", "apply", "DB", "--local");
    const passwordHash = await hashPassword(password);
    await writeFile(sqlFile, fixtureSql(passwordHash));
    exec("d1", "execute", "DB", "--local", "--file", sqlFile);
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
}

function exec(...args: string[]): void {
  execFileSync("npx", ["wrangler", ...args], { stdio: "ignore" });
}

function fixtureSql(passwordHash: string): string {
  const now = "2099-01-01T00:00:00.000Z";
  const users = E2E_USERS.map((user) => `INSERT INTO users (id, email, username, display_name, password_hash, role, is_active, created_at, updated_at)
VALUES (${sql(user.id)}, ${sql(user.email)}, ${sql(user.username)}, ${sql(user.displayName)}, ${sql(passwordHash)}, ${sql(user.role)}, 1, ${sql(now)}, ${sql(now)})
ON CONFLICT(email) DO UPDATE SET display_name = excluded.display_name, password_hash = excluded.password_hash, role = excluded.role, is_active = 1, updated_at = excluded.updated_at;`).join("\n");
  const inquiries = [
    ["e2e-dashboard-01", "张一", "zhang1@example.test", "新询盘", "new", "2099-01-01T00:00:06.000Z"],
    ["e2e-dashboard-02", "李二", "li2@example.test", "联系公司", "contacted", "2099-01-01T00:00:05.000Z"],
    ["e2e-dashboard-03", "王三", "wang3@example.test", "项目公司", "new", "2099-01-01T00:00:04.000Z"],
    ["e2e-dashboard-04", "赵四", "zhao4@example.test", "采购公司", "qualified", "2099-01-01T00:00:03.000Z"],
    ["e2e-dashboard-05", "周五", "zhou5@example.test", "设计公司", "closed", "2099-01-01T00:00:02.000Z"],
    ["e2e-dashboard-06", "<img src=x>", "safe@example.test", "文本安全", "new", "2099-01-01T00:00:01.000Z"],
  ].map(([id, name, email, company, status, timestamp]) => `INSERT INTO inquiries (id, inquiry_type, name, email, company, source_route, status, created_at, updated_at)
VALUES (${sql(id)}, 'catalog', ${sql(name)}, ${sql(email)}, ${sql(company)}, '/__e2e__/dashboard', ${sql(status)}, ${sql(timestamp)}, ${sql(timestamp)});`).join("\n");
  return `DELETE FROM inquiry_interests WHERE inquiry_id LIKE 'e2e-dashboard-%';
DELETE FROM inquiries WHERE id LIKE 'e2e-dashboard-%';
DELETE FROM sessions WHERE user_id IN ('e2e-admin', 'e2e-editor', 'e2e-sales');
DELETE FROM rate_limits WHERE key = 'auth:login:unknown';
${users}
${inquiries}`;
}

function sql(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}
