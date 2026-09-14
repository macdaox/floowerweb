import { expect, test, type Page } from "@playwright/test";

test("protects the admin dashboard, signs in, and signs out", async ({ page }) => {
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/admin\/login/);

  const dashboardResponse = page.waitForResponse((response) => response.url().endsWith("/api/admin/dashboard"));
  await loginAs(page, "admin@example.com", process.env.E2E_ADMIN_PASSWORD ?? "correct horse battery staple");
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  await expect(page.getByText("New inquiries")).toBeVisible();
  await expect(page.getByText("暂无询盘。")).toBeVisible();
  expect((await dashboardResponse).status()).toBe(200);

  await page.getByRole("button", { name: /账户菜单|account menu/i }).click();
  await page.getByRole("button", { name: /退出登录|sign out/i }).click();
  await expect(page).toHaveURL(/\/admin\/login/);
});

async function loginAs(page: Page, email: string, password: string): Promise<void> {
  await page.getByLabel(/邮箱地址|email/i).fill(email);
  await page.getByLabel(/密码|password/i).fill(password);
  await page.getByRole("button", { name: /登录|sign in/i }).click();
}

test("opens the role-aware navigation on small screens", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/admin/login");
  const dashboardResponse = page.waitForResponse((response) => response.url().endsWith("/api/admin/dashboard"));
  await loginAs(page, "admin@example.com", process.env.E2E_ADMIN_PASSWORD ?? "correct horse battery staple");
  await dashboardResponse;

  const menu = page.getByRole("button", { name: "菜单", exact: true });
  await menu.click();
  await expect(menu).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("link", { name: "询盘" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(menu).toHaveAttribute("aria-expanded", "false");
});
