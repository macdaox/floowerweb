import { expect, test } from "@playwright/test";

test("every public inquiry form is configured for accessible submission", async ({ page }) => {
  for (const [path, name] of [
    ["/", /partner with everstem/i],
    ["/products/magnolia-stem", /inquire about magnolia/i],
    ["/contact", /contact everstem/i],
    ["/wholesale", /request wholesale catalog/i],
  ] as const) {
    await page.goto(path);
    const form = page.getByRole("form", { name });
    await expect(form).toHaveAttribute("data-inquiry-form", "");
    await expect(form.getByRole("button")).toHaveAttribute("type", "submit");
    await expect(form.locator("[role=status]")).toHaveAttribute("aria-live", "polite");
    await expect(form.getByLabel("Name")).toHaveAttribute("minlength", "2");
  }
});

test("catalog form reports field errors and a success result without leaving the page", async ({ page }) => {
  await page.goto("/");
  const form = page.getByRole("form", { name: /partner with everstem/i });
  await form.getByLabel("Name").fill("Ada Lovelace");
  await form.getByLabel("Company").fill("Analytical Engines");
  await form.getByLabel("Business email").fill("ada@example.com");
  await form.getByLabel("Country / market").fill("United Kingdom");
  await form.getByLabel("Buyer type").selectOption({ label: "Retailer" });
  await form.getByLabel("Product interest").selectOption({ index: 1 });

  await page.route("**/api/inquiries", async (route) => {
    await route.fulfill({ status: 422, contentType: "application/json", body: JSON.stringify({ ok: false, error: { fields: {
      name: "Enter your name.", company: "This field is required for catalog requests.", email: "Enter a valid email address.",
      country: "This field is required for catalog requests.", buyerType: "This field is required for catalog requests.", interests: "Choose at least one product interest.",
    } } }) });
  });
  await form.getByRole("button", { name: /request catalog/i }).click();
  for (const label of ["Name", "Company", "Business email", "Country / market", "Buyer type", "Product interest"]) {
    await expect(form.getByLabel(label)).toHaveAttribute("aria-invalid", "true");
  }
  await expect(form.getByText("Enter a valid email address.")).toBeVisible();
  await expect(form.getByText("Enter your name.")).toHaveAttribute("role", "alert");
  await expect(form.getByText("Choose at least one product interest.")).toBeVisible();
  await expect(form.getByLabel("Product interest")).toHaveAttribute("aria-describedby", "catalog-interest-error");

  await page.unroute("**/api/inquiries");
  await page.route("**/api/inquiries", async (route) => {
    await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ ok: true, data: { id: "inquiry-1", status: "new" } }) });
  });
  await form.getByRole("button", { name: /request catalog/i }).click();
  await expect(form.getByRole("status")).toContainText(/thank you/i);
  await expect(page).toHaveURL(/\/$/);
});

test("newsletter subscription exposes its success state", async ({ page }) => {
  await page.goto("/");
  const form = page.getByRole("form", { name: /notes from everstem/i });
  await form.getByLabel("Email address").fill("news@example.com");
  await page.route("**/api/subscribers", async (route) => {
    await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ ok: true, data: { subscribed: true } }) });
  });

  await form.getByRole("button", { name: /subscribe/i }).click();
  await expect(form.getByRole("status")).toContainText(/subscribed/i);
});

test("the native newsletter destination resolves to the footer", async ({ page }) => {
  await page.goto("/?submitted=subscriber#footer");
  await expect(page).toHaveURL(/\/?submitted=subscriber#footer$/);
  await expect(page.getByRole("status").first()).toContainText(/subscribed/i);
  await expect(page.locator("#footer")).toContainText(/notes from everstem/i);
});

test("a retry keeps its idempotency key and preserves entered values until success", async ({ page }) => {
  await page.goto("/contact");
  const form = page.getByRole("form", { name: /contact everstem/i });
  await form.getByLabel("Name").fill("Ada Lovelace");
  await form.getByLabel("Business email").fill("ada@example.com");
  const keys: string[] = [];
  let attempts = 0;
  await page.route("**/api/inquiries", async (route) => {
    keys.push(route.request().headers()["idempotency-key"] ?? "");
    attempts += 1;
    if (attempts < 3) return route.abort("failed");
    return route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ ok: true, data: { id: "inquiry-1", status: "new" } }) });
  });

  await form.getByRole("button", { name: /send enquiry/i }).click();
  await expect(form.getByRole("status")).toContainText(/check your connection/i);
  await expect(form.getByLabel("Name")).toHaveValue("Ada Lovelace");
  await form.getByRole("button", { name: /send enquiry/i }).click();
  await expect(form.getByRole("status")).toContainText(/check your connection/i);
  await form.getByLabel("Name").fill("Ada Byron");
  await form.getByRole("button", { name: /send enquiry/i }).click();
  await expect(form.getByRole("status")).toContainText(/thank you/i);
  await form.getByLabel("Name").fill("Ada Byron");
  await form.getByLabel("Business email").fill("ada@example.com");
  await form.getByRole("button", { name: /send enquiry/i }).click();
  expect(keys).toHaveLength(4);
  expect(keys[1]).toBe(keys[0]);
  expect(keys[2]).not.toBe(keys[1]);
  expect(keys[3]).not.toBe(keys[2]);
});

test("public forms expose server-aligned field constraints and newsletter error text", async ({ page }) => {
  await page.goto("/contact");
  const contact = page.getByRole("form", { name: /contact everstem/i });
  await expect(contact.getByLabel("Business email")).toHaveAttribute("maxlength", "254");
  await expect(contact.getByLabel("Company")).toHaveAttribute("maxlength", "120");
  await expect(contact.getByLabel("Phone")).toHaveAttribute("maxlength", "60");
  await expect(contact.getByLabel("How can we help?")).toHaveAttribute("maxlength", "2000");
  await expect(contact.getByLabel("Name")).toHaveAttribute("minlength", "2");

  await page.goto("/");
  const catalog = page.getByRole("form", { name: /partner with everstem/i });
  await expect(catalog.getByLabel("Name")).toHaveAttribute("minlength", "2");
  await expect(catalog.getByLabel("Product interest")).toHaveAttribute("aria-describedby", "catalog-interest-error");

  const newsletter = page.getByRole("form", { name: /notes from everstem/i });
  await expect(newsletter.getByLabel("Email address")).toHaveAttribute("aria-describedby", "newsletter-email-error");
  await page.route("**/api/subscribers", async (route) => route.fulfill({ status: 422, contentType: "application/json", body: JSON.stringify({ ok: false, error: { fields: { email: "Enter a valid email address." } } }) }));
  await newsletter.getByLabel("Email address").fill("bad@example.com");
  await newsletter.getByRole("button", { name: /subscribe/i }).click();
  await expect(newsletter.getByLabel("Email address")).toHaveAttribute("aria-invalid", "true");
  await expect(newsletter.getByText("Enter a valid email address.")).toBeVisible();
});
