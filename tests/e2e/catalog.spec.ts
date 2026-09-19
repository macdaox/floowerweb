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

test("catalog pages provide branded missing and pagination-boundary outcomes", async ({ page }) => {
  const missing = await navigate(page, "/products/draft-product");
  expect(missing?.status()).toBe(404);

  const missingCategory = await navigate(page, "/collections/draft-category");
  expect(missingCategory?.status()).toBe(404);

  const outOfRange = await navigate(page, "/collections?page=999");
  expect(outOfRange?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: /page has wandered/i })).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);

  const categoryOutOfRange = await navigate(page, "/collections/artificial-flowers?page=999");
  expect(categoryOutOfRange?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: /page has wandered/i })).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
});

test("product and space cards render their cover assignment alt in lists and related sections", async ({ page }) => {
  await navigate(page, "/collections");
  await expect(page.locator('a[href="/products/e2e-alt-product-related"] img')).toHaveAttribute("alt", "Related product assignment alt");

  await navigate(page, "/products/e2e-alt-product-primary");
  await expect(page.locator('a[href="/products/e2e-alt-product-related"] img')).toHaveAttribute("alt", "Related product assignment alt");

  await navigate(page, "/spaces");
  await expect(page.locator('a[href="/spaces/e2e-alt-space-related"] img')).toHaveAttribute("alt", "Related space assignment alt");

  await navigate(page, "/spaces/e2e-alt-space-primary");
  await expect(page.locator('a[href="/spaces/e2e-alt-space-related"] img')).toHaveAttribute("alt", "Related space assignment alt");
});

function navigate(page: Page, url: string) {
  return page.goto(url, { waitUntil: "commit", timeout: 5_000 });
}
