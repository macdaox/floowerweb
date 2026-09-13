import { spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assertStrongAdminPassword } from "../src/features/auth/schemas";
import { hashPassword } from "../src/features/auth/password";

const args = process.argv.slice(2);
const requestedEmail = optionValue("--email")?.trim().toLowerCase();
const configPath = optionValue("--config");
const database = optionValue("--database") ?? "DB";
const password = process.env.EVERSTEM_ADMIN_PASSWORD;

if (!requestedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(requestedEmail) || requestedEmail.length > 254) {
  throw new Error("--email must be a valid email address.");
}
const email = requestedEmail;
if (!password) throw new Error("EVERSTEM_ADMIN_PASSWORD must be set.");
assertStrongAdminPassword(password);

const directory = await mkdtemp(join(tmpdir(), "everstem-admin-"));
const sqlFile = join(directory, "create-admin.sql");
const now = new Date().toISOString();
const id = crypto.randomUUID();
const username = `admin-${id.slice(0, 8)}`;

try {
  await writeFile(sqlFile, `INSERT INTO users (id, email, username, display_name, password_hash, role, is_active, created_at, updated_at)
SELECT ${literal(id)}, ${literal(email)}, ${literal(username)}, 'Administrator', ${literal(await hashPassword(password))}, 'admin', 1, ${literal(now)}, ${literal(now)}
WHERE NOT EXISTS (SELECT 1 FROM users WHERE email = ${literal(email)} OR role = 'admin');`);
  const command = ["wrangler", "d1", "execute", database, "--local"];
  if (configPath) command.push("--config", configPath);
  command.push("--file", sqlFile);
  const result = spawnSync("npx", command, { encoding: "utf8" });
  if (result.status !== 0) {
    if ((result.stderr ?? "").includes("UNIQUE constraint failed: users.email")) throw new Error("An administrator with that email already exists.");
    throw new Error("Unable to create the administrator.");
  }
  if (!createdAdministrator()) {
    const existing = findExistingAdministrator();
    if (existing?.email === email) throw new Error("An administrator with that email already exists.");
    throw new Error("An administrator already exists; use the authenticated user-management workflow instead.");
  }
  console.log(`Created administrator ${email}.`);
} finally {
  await rm(directory, { force: true, recursive: true });
}

function optionValue(name: string): string | undefined {
  const index = args.indexOf(name);
  if (index === -1) return undefined;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a value.`);
  return value;
}

function literal(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function findExistingAdministrator(): { email: string } | undefined {
  const candidate = queryD1("SELECT email FROM users WHERE email = " + literal(email) + " OR role = 'admin' LIMIT 1")[0];
  return candidate?.email ? { email: candidate.email } : undefined;
}

function createdAdministrator(): boolean {
  return queryD1("SELECT id FROM users WHERE id = " + literal(id) + " LIMIT 1").length === 1;
}

function queryD1(sql: string): Array<{ email?: string; id?: string }> {
  const command = ["wrangler", "d1", "execute", database, "--local"];
  if (configPath) command.push("--config", configPath);
  command.push("--command", sql, "--json");
  const result = spawnSync("npx", command, { encoding: "utf8" });
  if (result.status !== 0) throw new Error("Unable to inspect existing administrators.");
  const parsed = JSON.parse(result.stdout) as Array<{ results?: Array<{ email?: string; id?: string }> }>;
  return parsed[0]?.results ?? [];
}
