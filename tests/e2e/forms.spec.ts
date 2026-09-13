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
    await route.fulfill({ status: 422, contentType: "application/json", body: JSON.stringify({ ok: false, error: { fields: { email: "Enter a valid email address." } } }) });
  });
  await form.getByRole("button", { name: /request catalog/i }).click();
  await expect(form.getByLabel("Business email")).toHaveAttribute("aria-invalid", "true");
  await expect(form.getByText("Enter a valid email address.")).toBeVisible();

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
