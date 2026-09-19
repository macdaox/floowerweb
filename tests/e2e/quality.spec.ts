import { expect, test, type APIRequestContext } from "@playwright/test";

const representativeRoutes = [
  "/",
  "/collections",
  "/collections/artificial-flowers",
  "/products/magnolia-stem",
  "/spaces",
  "/spaces/hospitality-botanicals",
  "/journal",
  "/journal/material-and-color-development",
  "/about",
  "/contact",
  "/wholesale",
  "/privacy",
  "/terms",
] as const;

test("public pages expose unique canonical metadata and valid structured data", async ({ page }) => {
  const seenTitles = new Set<string>();
  const seenCanonicals = new Set<string>();

  for (const route of representativeRoutes) {
    await page.goto(route);
    const title = await page.title();
    const canonical = await page.locator('link[rel="canonical"]').getAttribute("href");
    expect(title, route).not.toBe("");
    expect(seenTitles, `${route} has a duplicate title`).not.toContain(title);
    expect(canonical, route).toBe(new URL(route, "http://127.0.0.1:4321").href);
    expect(seenCanonicals, `${route} has a duplicate canonical`).not.toContain(canonical);
    expect(await page.locator('meta[name="description"]').getAttribute("content"), route).not.toBe("");
    await expect(page.locator('meta[property="og:title"]'), route).toHaveAttribute("content", title);
    await expect(page.locator('meta[property="og:url"]'), route).toHaveAttribute("content", canonical!);

    const structuredData = page.locator('script[type="application/ld+json"]');
    await expect(structuredData, route).toHaveCount(1);
    const serializedStructuredData = (await structuredData.textContent()) ?? "";
    expect(() => JSON.parse(serializedStructuredData), route).not.toThrow();
    seenTitles.add(title);
    seenCanonicals.add(canonical!);
  }

  await page.goto("/products/magnolia-stem");
  expect(await page.locator('script[type="application/ld+json"]').textContent()).toContain('"@type":"Product"');
  expect(await page.locator('script[type="application/ld+json"]').textContent()).toContain('"@type":"BreadcrumbList"');

  await page.goto("/journal/material-and-color-development");
  expect(await page.locator('script[type="application/ld+json"]').textContent()).toContain('"@type":"Article"');

  await page.goto("/collections");
  const firstPageTitle = await page.title();
  const firstPageDescription = await page.locator('meta[name="description"]').getAttribute("content");
  await page.goto("/collections?page=2");
  expect(await page.title()).not.toBe(firstPageTitle);
  expect(await page.locator('meta[name="description"]').getAttribute("content")).not.toBe(firstPageDescription);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", "http://127.0.0.1:4321/collections?page=2");
});

test("robots and sitemap expose only indexable published pages", async ({ request }) => {
  const robots = await request.get("/robots.txt");
  expect(robots.status()).toBe(200);
  expect(robots.headers()["content-type"]).toContain("text/plain");
  const robotsText = await robots.text();
  expect(robotsText).toContain("User-agent: *");
  expect(robotsText).toContain("Disallow: /admin\n");
  expect(robotsText).toContain("Disallow: /api\n");
  expect(robotsText).toContain("Disallow: /preview\n");
  expect(robotsText).toContain("Sitemap: http://127.0.0.1:4321/sitemap.xml");

  const sitemap = await request.get("/sitemap.xml");
  expect(sitemap.status()).toBe(200);
  expect(sitemap.headers()["content-type"]).toContain("application/xml");
  const xml = await sitemap.text();
  expect(xml).toContain("<loc>http://127.0.0.1:4321/products/magnolia-stem</loc>");
  expect(xml).toContain("<loc>http://127.0.0.1:4321/journal/material-and-color-development</loc>");
  expect(xml).not.toContain("draft-product");
  expect(xml).not.toContain("/admin");
  expect(xml).not.toContain("/preview");
});

test("missing and server-error pages retain the EVERSTEM shell", async ({ page }) => {
  const missing = await page.goto("/this-page-does-not-exist");
  expect(missing?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: /page has wandered/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /return home/i })).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);

  const error = await page.goto("/500");
  expect(error?.status()).toBe(500);
  await expect(page.getByRole("heading", { name: /something went out of season/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /return home/i })).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
});

test("public imagery reserves space, supplies responsive hints, and prioritizes only leading media", async ({ page }) => {
  for (const route of ["/", "/products/magnolia-stem", "/spaces/hospitality-botanicals", "/journal/material-and-color-development"]) {
    await page.goto(route);
    const images = page.locator("main img");
    for (let index = 0; index < await images.count(); index += 1) {
      const image = images.nth(index);
      expect(await image.getAttribute("width"), `${route} image ${index + 1} width`).toMatch(/^\d+$/);
      expect(await image.getAttribute("height"), `${route} image ${index + 1} height`).toMatch(/^\d+$/);
      expect(await image.getAttribute("sizes"), `${route} image ${index + 1} sizes`).not.toBeNull();
      expect(await image.getAttribute("loading"), `${route} image ${index + 1} loading`).toMatch(/^(eager|lazy)$/);
    }
    expect(await page.locator('main img[fetchpriority="high"]').count(), `${route} leading image priority`).toBe(1);
  }
});

test("invalid form responses preserve values and move focus to the first field in error", async ({ page }) => {
  await page.route("**/api/inquiries", async (route) => {
    await route.fulfill({
      status: 422,
      contentType: "application/json",
      body: JSON.stringify({ error: { message: "Please check your details.", fields: { name: "Enter your full name." } } }),
    });
  });
  await page.goto("/products/magnolia-stem");
  const name = page.getByLabel("Name");
  await name.fill("Ada Lovelace");
  await page.getByLabel("Business email").fill("ada@example.com");
  await page.getByRole("button", { name: /send inquiry/i }).click();

  await expect(name).toHaveValue("Ada Lovelace");
  await expect(name).toHaveAttribute("aria-invalid", "true");
  await expect(name).toBeFocused();
  await expect(page.getByText("Enter your full name.")).toBeVisible();
});

test("product galleries move focus with arrow, Home, and End keys", async ({ page }) => {
  await page.goto("/products/e2e-alt-product-primary");
  const items = page.locator("[data-gallery-item]");
  await expect(items).toHaveCount(2);
  await items.first().focus();
  await page.keyboard.press("ArrowRight");
  await expect(items.last()).toBeFocused();
  await page.keyboard.press("Home");
  await expect(items.first()).toBeFocused();
  await page.keyboard.press("End");
  await expect(items.last()).toBeFocused();
  await page.keyboard.press("ArrowLeft");
  await expect(items.first()).toBeFocused();
});

test("headings, keyboard navigation, and reduced motion remain accessible", async ({ page }) => {
  for (const route of representativeRoutes) {
    await page.goto(route);
    expect(await page.locator("main h1").count(), `${route} h1 count`).toBe(1);
    const levels = await page.locator("main h1, main h2, main h3, main h4, main h5, main h6").evaluateAll((headings) => headings.map((heading) => Number(heading.tagName.slice(1))));
    for (let index = 1; index < levels.length; index += 1) {
      expect(levels[index] - levels[index - 1], `${route} heading jump`).toBeLessThanOrEqual(1);
    }
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const menu = page.getByRole("button", { name: /menu/i });
  await menu.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("link", { name: "Home", exact: true })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(menu).toBeFocused();

  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.reload();
  await expect(page.locator("[data-reveal]").first()).toBeVisible();
});

test("sitemap pages have no broken internal links or public console errors", async ({ page, request }) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("response", (response) => {
    if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`);
  });

  const sitemap = await request.get("/sitemap.xml");
  const paths = [...(await sitemap.text()).matchAll(/<loc>https?:\/\/[^/]+([^<]*)<\/loc>/g)].map((match) => match[1] || "/");
  expect(paths.length).toBeGreaterThan(0);

  const links = new Set<string>(paths);
  for (const path of paths) {
    await page.goto(path);
    const hrefs = await page.locator('a[href^="/"]').evaluateAll((anchors) => anchors.map((anchor) => anchor.getAttribute("href") ?? ""));
    hrefs.forEach((href) => links.add(href.split("#")[0] || "/"));
  }
  await expectPublicLinksToResolve(request, links);
  expect(errors).toEqual([]);
});

async function expectPublicLinksToResolve(request: APIRequestContext, links: Set<string>): Promise<void> {
  for (const link of [...links].sort()) {
    const response = await request.get(link);
    expect(response.status(), link).toBeLessThan(400);
  }
}
