import { expect, test, type Page } from "@playwright/test";

test("sales manages an inquiry, adds a note, filters subscribers, and exports CSV", async ({ page }) => {
  await login(page, "e2e-sales@everstem.test");
  await page.goto("/admin/inquiries");
  await page.getByLabel("状态筛选").selectOption("new");
  await page.getByRole("button", { name: /张一/ }).click();
  await page.locator("[aria-label='询盘详情']").getByRole("combobox").first().selectOption("e2e-sales");
  await page.getByRole("button", { name: "保存负责人" }).click();
  await expect(page.locator("[data-inquiry-feedback]")).toContainText("已保存");
  await page.getByLabel("内部备注").fill("E2E Called buyer");
  await page.getByRole("button", { name: "添加备注" }).click();
  await expect(page.getByText("E2E Called buyer")).toBeVisible();
  await page.getByLabel("转换状态").selectOption("contacted");
  await page.getByRole("button", { name: "更新状态" }).click();
  await expect(page.locator("[aria-label='询盘详情']")).toContainText("已联系");
  await page.getByRole("button", { name: "关闭询盘" }).click();
  await page.getByRole("button", { name: "下一页" }).click();
  await expect(page.getByText("第 2 / 2 页")).toBeVisible();
  await page.getByRole("button", { name: /E2E Later Inquiry/ }).click();
  await expect(page.locator("[aria-label='询盘详情']")).toContainText("later-inquiry@example.test");
  await page.getByRole("button", { name: "关闭询盘" }).click();
  await page.getByLabel("状态筛选").selectOption("contacted");
  await expect(page.getByText("第 1 / 1 页")).toBeVisible();
  await expect(page.getByRole("button", { name: "上一页" })).toBeDisabled();

  await page.goto("/admin/subscribers");
  await page.getByLabel("订阅状态").selectOption("subscribed");
  await expect(page.getByRole("table", { name: "订阅者列表" })).toBeVisible();
  const exportLink = page.getByRole("link", { name: "导出 CSV" });
  await expect(exportLink).toHaveAttribute("href", /status=subscribed/);
  await page.getByRole("button", { name: "下一页" }).click();
  await expect(page.getByText("第 2 / 2 页")).toBeVisible();
  await expect(page.getByText("late-subscriber@example.test")).toBeVisible();
  await page.getByLabel("来源筛选").fill("/__e2e__/late");
  await expect(page.getByText("第 1 / 1 页")).toBeVisible();
  await expect(exportLink).toHaveAttribute("href", /status=subscribed.*source=%2F__e2e__%2Flate/);
  await page.getByLabel("来源筛选").fill("");
  await expect(page.getByText("第 1 / 2 页")).toBeVisible();
  const csvResponse = await browserDownload(page, await exportLink.getAttribute("href") ?? "/api/admin/subscribers/export");
  expect(csvResponse.status).toBe(200);
  expect(csvResponse.bytes.slice(0, 3)).toEqual([0xef, 0xbb, 0xbf]);
  const csv = new TextDecoder().decode(new Uint8Array(csvResponse.bytes));
  expect(csv).toContain("'=IMPORTXML(example)");
  expect(csv).toContain("'=HYPERLINK");
});

test("admin manages users and settings while editor is denied", async ({ page }) => {
  await login(page, "e2e-editor@everstem.test");
  expect(await browserStatus(page, "/api/admin/users/list")).toBe(403);
  expect(await browserStatus(page, "/api/admin/settings")).toBe(403);
  expect(await browserStatus(page, "/api/admin/inquiries/list")).toBe(403);
  expect(await browserStatus(page, "/api/admin/subscribers/export")).toBe(403);
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

  await page.goto("/admin/users");
  const resetRow = page.getByRole("row", { name: /E2E Managed User/ });
  page.once("dialog", (dialog) => dialog.accept("E2E-managed-reset-2026!"));
  await resetRow.getByRole("button", { name: "重置密码" }).click();
  await expect(page.locator("[data-user-feedback]")).toContainText("已保存");
  await logout(page);
  await login(page, "e2e-managed@everstem.test", "E2E-managed-reset-2026!");
});

async function login(page: Page, email: string, suppliedPassword?: string): Promise<void> {
  const password = suppliedPassword ?? process.env.E2E_ADMIN_PASSWORD;
  if (!password) throw new Error("E2E_ADMIN_PASSWORD must be set for authenticated browser tests.");
  await page.route("**/api/auth/login", async (route) => {
    await route.continue({ headers: { ...route.request().headers(), "cf-connecting-ip": `e2e-operations-${crypto.randomUUID()}` } });
  }, { times: 1 });
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

async function browserStatus(page: Page, url: string): Promise<number> {
  return page.evaluate(async (path) => (await fetch(path)).status, url);
}

async function browserDownload(page: Page, url: string): Promise<{ status: number; bytes: number[] }> {
  return page.evaluate(async (path) => {
    const response = await fetch(path);
    return { status: response.status, bytes: Array.from(new Uint8Array(await response.arrayBuffer())) };
  }, url);
}
