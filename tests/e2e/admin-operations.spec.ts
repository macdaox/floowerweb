import { expect, test, type Page } from "@playwright/test";

test("sales manages an inquiry, adds a note, filters subscribers, and exports CSV", async ({ page }) => {
  await login(page, "e2e-sales@everstem.test");
  await page.goto("/admin/inquiries");
  await page.getByLabel("状态筛选").selectOption("new");
  await page.getByRole("button", { name: /张一/ }).click();
  await page.getByLabel("负责人").selectOption("e2e-sales");
  await page.getByRole("button", { name: "保存负责人" }).click();
  await expect(page.locator("[data-inquiry-feedback]")).toContainText("已保存");
  await page.getByLabel("内部备注").fill("E2E Called buyer");
  await page.getByRole("button", { name: "添加备注" }).click();
  await expect(page.getByText("E2E Called buyer")).toBeVisible();

  await page.goto("/admin/subscribers");
  await page.getByLabel("订阅状态").selectOption("subscribed");
  await expect(page.getByRole("table", { name: "订阅者列表" })).toBeVisible();
  await expect(page.getByRole("link", { name: "导出 CSV" })).toHaveAttribute("href", /status=subscribed/);
});

test("admin manages users and settings while editor is denied", async ({ page }) => {
  await login(page, "e2e-editor@everstem.test");
  await page.goto("/admin/users");
  await expect(page).toHaveURL(/\/admin$/);

  await logout(page);
  await login(page, "e2e-admin@everstem.test");
  await page.goto("/admin/users");
  const row = page.getByRole("row", { name: /E2E Managed User/ });
  await row.getByLabel("角色").selectOption("sales");
  await row.getByRole("button", { name: "保存用户" }).click();
  await expect(page.locator("[data-user-feedback]")).toContainText("已保存");

  await page.goto("/admin/settings");
  await page.getByLabel("品牌标语").fill("E2E Botanical objects");
  await page.getByRole("button", { name: "保存设置" }).click();
  await expect(page.locator("[data-settings-feedback]")).toContainText("已保存");
});

async function login(page: Page, email: string): Promise<void> {
  const password = process.env.E2E_ADMIN_PASSWORD;
  if (!password) throw new Error("E2E_ADMIN_PASSWORD must be set for authenticated browser tests.");
  await page.goto("/admin/login");
  await page.getByLabel("邮箱地址").fill(email);
  await page.getByLabel("密码").fill(password);
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page).toHaveURL(/\/admin$/);
}

async function logout(page: Page): Promise<void> {
  await page.getByRole("button", { name: "账户菜单" }).click();
  await page.getByRole("button", { name: "退出登录" }).click();
  await expect(page).toHaveURL(/\/admin\/login/);
}
