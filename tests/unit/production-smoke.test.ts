import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../..");

describe("production smoke configuration", () => {
  it("builds and serves dist with Wrangler under a dedicated Playwright config", async () => {
    const [packageJson, config] = await Promise.all([
      readFile(resolve(root, "package.json"), "utf8").then((value) => JSON.parse(value) as { scripts: Record<string, string>; devDependencies: Record<string, string> }),
      readFile(resolve(root, "playwright.smoke.config.ts"), "utf8"),
    ]);
    expect(packageJson.scripts["test:smoke"]).toContain("npm run build");
    expect(packageJson.scripts["test:smoke"]).toContain("playwright.smoke.config.ts");
    expect(config).toContain("wrangler pages dev ./dist");
    expect(config).toContain("SESSION_SECRET");
    expect(Number(packageJson.devDependencies.wrangler.replace(/^[^0-9]*/u, "").split(".")[0])).toBeGreaterThanOrEqual(4);
  });
});
