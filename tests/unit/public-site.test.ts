import { describe, expect, it } from "vitest";
import { resolvePublicSiteOrigin } from "../../src/features/public/site-origin";

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

  it("fails closed without a production origin and uses a documented loopback origin only in local development", () => {
    expect(() => resolvePublicSiteOrigin(undefined, { allowLocalDefault: false })).toThrow(/PUBLIC_SITE_URL/);
    expect(resolvePublicSiteOrigin(undefined, { allowLocalDefault: true })).toBe("http://127.0.0.1:4321");
  });
});
