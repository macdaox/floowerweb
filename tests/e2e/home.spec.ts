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
