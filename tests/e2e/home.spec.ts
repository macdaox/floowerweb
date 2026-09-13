import { expect, test } from "@playwright/test";

test("home preserves the brand demo and navigation", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: /nature, reimagined/i })).toBeVisible();
  await expect(page.getByRole("link", { name: "About Us" })).toHaveAttribute("href", "/about");
  await expect(page.getByRole("link", { name: "Contact Us" })).toHaveAttribute("href", "/contact");
  await expect(page.getByRole("link", { name: /request catalog/i }).first()).toBeVisible();
});

test("home menu is keyboard-operable on small screens", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  await expect(page.getByRole("link", { name: /skip to content/i })).toHaveAttribute("href", "#main");
  const menu = page.getByRole("button", { name: /menu/i });
  await menu.focus();
  await page.keyboard.press("Enter");
  await expect(menu).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("link", { name: "Contact Us" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(menu).toHaveAttribute("aria-expanded", "false");
});

test("home reveals in-view sections and respects reduced motion", async ({ page }) => {
  await page.goto("/");

  const detail = page.locator(".detail-copy");
  await expect(page.locator("html")).toHaveClass(/js/);
  await expect(detail).toHaveCSS("opacity", "0");
  await detail.scrollIntoViewIfNeeded();
  await expect(detail).toHaveClass(/is-visible/);
  await expect(detail).toHaveCSS("opacity", "1");

  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.reload();
  await expect(page.locator(".detail-copy")).toHaveClass(/is-visible/);
  await expect(page.locator(".detail-copy")).toHaveCSS("opacity", "1");
});

test("home keeps reveal content visible without JavaScript", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto("http://127.0.0.1:4321/");

  await expect(page.locator(".detail-copy")).toHaveCSS("opacity", "1");
  await context.close();
});

test("footer distinguishes the newsletter group from its email field", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("form", { name: /notes from everstem/i })).toBeVisible();
  await expect(page.getByLabel("Email address")).toHaveAttribute("type", "email");
});
