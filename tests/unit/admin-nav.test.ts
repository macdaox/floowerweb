import { describe, expect, it } from "vitest";
import { adminNavigation } from "../../src/components/admin/AdminNav";

describe("role-aware admin navigation", () => {
  it("gives administrators every planned section and points journal at its planned route", () => {
    const links = adminNavigation("admin");
    expect(links.map((link) => link.href)).toContain("/admin/journal");
    expect(links.map((link) => link.href)).not.toContain("/admin/articles");
    expect(links).toHaveLength(10);
  });

  it("limits editors to content sections and sales users to lead sections", () => {
    expect(adminNavigation("editor").map((link) => link.href)).toEqual([
      "/admin", "/admin/products", "/admin/spaces", "/admin/journal", "/admin/pages", "/admin/media",
    ]);
    expect(adminNavigation("sales").map((link) => link.href)).toEqual([
      "/admin", "/admin/inquiries", "/admin/subscribers",
    ]);
  });
});
