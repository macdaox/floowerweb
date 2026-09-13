import { expect, test } from "@playwright/test";

test("editorial and company routes render a page heading", async ({ page }) => {
  for (const route of ["/about", "/contact", "/wholesale", "/privacy", "/terms", "/spaces", "/journal"]) {
    const response = await page.goto(route, { waitUntil: "commit", timeout: 5_000 });
    expect(response?.status()).toBe(200);
    await expect(page.locator("h1")).toBeVisible();
  }
});
