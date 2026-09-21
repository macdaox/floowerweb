import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { resolvePublicSiteOrigin } from "../../src/features/public/site-origin";
import { loadPublicSiteSettings } from "../../src/features/public/settings";

describe("public site origin", () => {
  it("normalizes one configured HTTPS origin", () => {
    expect(resolvePublicSiteOrigin("https://www.everstem.example/", { allowLocalDefault: false })).toBe("https://www.everstem.example");
  });

  it.each([
    "not a URL",
    "http://everstem.example",
    "https://user:secret@everstem.example",
    "https://everstem.example/a-path",
    "https://everstem.example?preview=1",
    "https://everstem.example/#fragment",
  ])("rejects invalid deployment configuration: %s", (configured) => {
    expect(() => resolvePublicSiteOrigin(configured, { allowLocalDefault: false })).toThrow(/PUBLIC_SITE_URL/);
  });

  it("uses the deployed Worker origin when runtime configuration is unavailable and loopback during local development", () => {
    expect(resolvePublicSiteOrigin(undefined, { allowLocalDefault: false })).toBe("https://floowerweb.zhaomeili1016.workers.dev");
    expect(resolvePublicSiteOrigin(undefined, { allowLocalDefault: true })).toBe("http://127.0.0.1:4321");
  });
});

describe("public site settings", () => {
  it("maps settings once for the shared public layout and safely falls back", async () => {
    const database = {
      prepare: () => ({ first: async () => ({
        company_name: "EVERSTEM Studio", tagline: "Edited tagline", company_description: "Edited company description",
        contact_email: "hello@everstem.test", instagram_url: "https://instagram.com/everstem",
        default_seo_title: "EVERSTEM default", default_seo_description: "Default site description",
      }) }),
    } as unknown as D1Database;
    await expect(loadPublicSiteSettings(database)).resolves.toMatchObject({
      companyName: "EVERSTEM Studio", contactEmail: "hello@everstem.test", defaultSeoTitle: "EVERSTEM default",
    });
    await expect(loadPublicSiteSettings(undefined)).resolves.toMatchObject({ companyName: "EVERSTEM", defaultSeoTitle: expect.stringContaining("EVERSTEM") });
  });

  it("loads settings centrally for non-home pages instead of requiring page-level plumbing", async () => {
    const root = resolve(import.meta.dirname, "../..");
    const [layout, collections] = await Promise.all([
      readFile(resolve(root, "src/layouts/PublicLayout.astro"), "utf8"),
      readFile(resolve(root, "src/pages/collections/index.astro"), "utf8"),
    ]);
    expect(layout).toContain("loadPublicSiteSettings");
    expect(layout).toContain("contactEmail");
    expect(collections).not.toContain("loadPublicSiteSettings");
  });
});
