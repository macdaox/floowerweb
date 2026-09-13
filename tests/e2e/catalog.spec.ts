import { expect, test, type Page } from "@playwright/test";

test("published product details are visible without commercial pricing", async ({ page }) => {
  await navigate(page, "/products/magnolia-stem");

  await expect(page.getByRole("heading", { name: /magnolia/i })).toBeVisible();
  await expect(page.getByRole("heading", { name: /specifications/i })).toBeVisible();
  await expect(page.locator(".product-gallery figure")).toHaveCount(1);
  await expect(page.getByText(/price/i)).toHaveCount(0);
  const inquiry = page.getByRole("form", { name: /inquire about magnolia/i });
  await expect(inquiry.getByRole("button", { name: /send inquiry/i })).toHaveAttribute("type", "submit");
  await expect(inquiry).toHaveAttribute("action", "/api/inquiries");
  await expect(inquiry).toHaveAttribute("method", "post");
});

test("collections expose product cards and category filtering", async ({ page }) => {
  await navigate(page, "/collections");

  await expect(page.getByRole("heading", { name: /collections/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /magnolia stem/i })).toHaveAttribute("href", "/products/magnolia-stem");
  await navigate(page, "/collections/artificial-flowers");
  await expect(page.getByRole("heading", { name: /artificial flowers/i })).toBeVisible();
});

test("catalog pages provide empty and missing-record outcomes", async ({ page }) => {
  const missing = await navigate(page, "/products/draft-product");
  expect(missing?.status()).toBe(404);

  const missingCategory = await navigate(page, "/collections/draft-category");
  expect(missingCategory?.status()).toBe(404);

  await navigate(page, "/collections?page=2");
  await expect(page.getByText(/no published products are available/i)).toBeVisible();
});

function navigate(page: Page, url: string) {
  return page.goto(url, { waitUntil: "commit", timeout: 5_000 });
}
