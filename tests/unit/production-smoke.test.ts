import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../..");

describe("production smoke configuration", () => {
  it("builds and serves dist with Wrangler under a dedicated Playwright config", async () => {
    const [packageJson, config, wranglerConfig, assetsIgnore] = await Promise.all([
      readFile(resolve(root, "package.json"), "utf8").then((value) => JSON.parse(value) as { scripts: Record<string, string>; devDependencies: Record<string, string> }),
      readFile(resolve(root, "playwright.smoke.config.ts"), "utf8"),
      readFile(resolve(root, "wrangler.toml"), "utf8"),
      readFile(resolve(root, "public/.assetsignore"), "utf8"),
    ]);
    expect(packageJson.scripts["test:smoke"]).toContain("npm run build");
    expect(packageJson.scripts["test:smoke"]).toContain("playwright.smoke.config.ts");
    expect(config).toContain("wrangler pages dev ./dist");
    expect(config).toContain("SESSION_SECRET");
    expect(wranglerConfig).toContain('name = "floowerweb"');
    expect(wranglerConfig).toContain("keep_vars = true");
    expect(wranglerConfig).toContain('main = "./dist/_worker.js/index.js"');
    expect(wranglerConfig).toContain("[assets]");
    expect(wranglerConfig).toContain('binding = "ASSETS"');
    expect(wranglerConfig).toContain('directory = "./dist"');
    expect(wranglerConfig).not.toContain("pages_build_output_dir");
    expect(wranglerConfig).toContain('database_name = "everstem-production"');
    expect(wranglerConfig).toContain('database_id = "3bdc89c4-0b94-40b2-8e58-36226ef77cd1"');
    expect(wranglerConfig).toContain('bucket_name = "everstem-media-production"');
    expect(wranglerConfig).toContain('PUBLIC_SITE_URL = "https://floowerweb.zhaomeili1016.workers.dev"');
    expect(assetsIgnore).toContain("_worker.js");
    expect(assetsIgnore).toContain("_routes.json");
    expect(Number(packageJson.devDependencies.wrangler.replace(/^[^0-9]*/u, "").split(".")[0])).toBeGreaterThanOrEqual(4);
  });
});
