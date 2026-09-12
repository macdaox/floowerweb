import { spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { renderSeedSql } from "./seed";

const args = process.argv.slice(2);
const remote = args.includes("--remote");
const configPath = optionValue("--config");
const database = optionValue("--database") ?? "DB";

if (remote && args.includes("--local")) {
  throw new Error("Choose only one database target: --local or --remote.");
}

const directory = await mkdtemp(join(tmpdir(), "everstem-seed-"));
const seedFile = join(directory, "everstem-seed.sql");

try {
  await writeFile(seedFile, renderSeedSql());
  const command = ["wrangler", "d1", "execute", database, remote ? "--remote" : "--local"];
  if (configPath) command.push("--config", configPath);
  command.push("--file", seedFile);

  const result = spawnSync("npx", command, { encoding: "utf8", stdio: "inherit" });
  if (result.status !== 0) process.exitCode = result.status ?? 1;
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
