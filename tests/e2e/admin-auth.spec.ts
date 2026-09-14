import { expect, test, type Page, type Route } from "@playwright/test";

const accounts = {
  admin: "e2e-admin@everstem.test",
  editor: "e2e-editor@everstem.test",
  sales: "e2e-sales@everstem.test",
} as const;

test("protects the admin dashboard, signs in, loads sales data, and signs out", async ({ page }) => {
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/admin\/login/);

  const dashboardResponse = page.waitForResponse((response) => response.url().endsWith("/api/admin/dashboard"));
  await loginAs(page, accounts.admin);
  await expect(page.getByRole("heading", { name: "仪表盘" })).toBeVisible();
  await expect(page.getByTestId("new-inquiries-metric")).not.toHaveText("—");
  await expect(page.getByText("最近7天收到", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "最近询盘" })).toBeVisible();
  expect((await dashboardResponse).status()).toBe(200);

  await page.getByRole("button", { name: "账户菜单" }).click();
  await page.getByRole("button", { name: "退出登录" }).click();
  await expect(page).toHaveURL(/\/admin\/login/);
});

test("shows editors only content metrics and never renders inquiry data", async ({ page }) => {
  const dashboardResponse = page.waitForResponse((response) => response.url().endsWith("/api/admin/dashboard"));
  await page.goto("/admin/login");
  await loginAs(page, accounts.editor);
  const body = await (await dashboardResponse).json() as { data: Record<string, unknown> };

  expect(body.data.kind).toBe("content");
  expect(JSON.stringify(body)).not.toContain("recentInquiries");
  expect(JSON.stringify(body)).not.toContain("zhang1@example.test");
  await expect(page.getByText("草稿产品")).toBeVisible();
  await expect(page.getByRole("link", { name: "询盘" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "订阅者" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "最近询盘" })).toHaveCount(0);
  await expect(page.getByText("张一")).toHaveCount(0);
});

test("renders role-aware navigation for administrators, editors, and sales users", async ({ page }) => {
  await page.goto("/admin/login");
  await loginAs(page, accounts.sales);
  await expect(page.getByRole("link", { name: "询盘" })).toBeVisible();
  await expect(page.getByRole("link", { name: "产品与分类" })).toHaveCount(0);
  await page.getByRole("button", { name: "账户菜单" }).click();
  await page.getByRole("button", { name: "退出登录" }).click();

  await loginAs(page, accounts.admin);
  await expect(page.getByRole("link", { name: "用户" })).toBeVisible();
  await expect(page.getByRole("link", { name: "设置" })).toBeVisible();
  await expect(page.getByRole("link", { name: "期刊内容" })).toHaveAttribute("href", "/admin/journal");
});

test("opens the navigation on small screens", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/admin/login");
  await loginAs(page, accounts.admin);

  const menu = page.getByRole("button", { name: "菜单", exact: true });
  await menu.click();
  await expect(menu).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("link", { name: "询盘" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(menu).toHaveAttribute("aria-expanded", "false");
});

test("keeps the table search control through Chinese IME, filters, paginates, and escapes text", async ({ page }) => {
  let releaseDashboard: (() => void) | undefined;
  await page.route("**/api/admin/dashboard", async (route) => {
    await new Promise<void>((resolve) => { releaseDashboard = resolve; });
    await fulfillDashboard(route, salesData());
  });
  await page.goto("/admin/login");
  await loginAs(page, accounts.admin);
  await expect(page.getByText("正在加载数据…")).toBeVisible();
  releaseDashboard?.();

  const search = page.getByRole("searchbox");
  const originalSearch = await search.elementHandle();
  await search.dispatchEvent("compositionstart");
  await search.fill("张一");
  await expect(page.getByText("李二")).toBeVisible();
  await search.dispatchEvent("compositionend");
  await expect(page.getByText("张一")).toBeVisible();
  await expect(page.getByText("李二")).toHaveCount(0);
  expect(await originalSearch?.evaluate((element) => element.isConnected)).toBe(true);

  await search.fill("");
  await page.getByRole("button", { name: "新询盘" }).click();
  await expect(page.getByText("李二")).toHaveCount(0);
  await page.getByRole("button", { name: "全部" }).click();
  await page.getByRole("button", { name: "下一页" }).click();
  await expect(page.getByText("<img src=x>", { exact: true })).toBeVisible();
  await expect(page.locator("[data-recent-inquiries] img")).toHaveCount(0);

  await search.fill("不存在的姓名");
  await expect(page.getByText("暂无询盘。")).toBeVisible();
});

test("renders the table error state and retries through the same table contract", async ({ page }) => {
  let calls = 0;
  await page.route("**/api/admin/dashboard", async (route) => {
    calls += 1;
    if (calls === 1) await route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ ok: false }) });
    else await fulfillDashboard(route, salesData());
  });
  await page.goto("/admin/login");
  await loginAs(page, accounts.admin);
  await expect(page.getByRole("alert")).toContainText("无法加载最近询盘。");
  await page.getByRole("button", { name: "重试" }).click();
  await expect(page.getByText("张一")).toBeVisible();
});

async function loginAs(page: Page, email: string): Promise<void> {
  const password = process.env.E2E_ADMIN_PASSWORD;
  if (!password) throw new Error("E2E_ADMIN_PASSWORD must be set for authenticated browser tests.");
  await page.getByLabel("邮箱地址").fill(email);
  await page.getByLabel("密码").fill(password);
  await page.getByRole("button", { name: "登录" }).click();
}

async function fulfillDashboard(route: Route, data: ReturnType<typeof salesData>): Promise<void> {
  await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, data }) });
}

function salesData() {
  return {
    kind: "sales" as const,
    metrics: { newInquiries: 5, recentSevenDays: 6, activeSubscribers: 7, publishedProducts: 8 },
    recentInquiries: [
      inquiry("张一", "new"), inquiry("李二", "contacted"), inquiry("王三", "new"), inquiry("赵四", "qualified"), inquiry("周五", "closed"), inquiry("<img src=x>", "new"),
    ],
  };
}

function inquiry(name: string, status: "new" | "contacted" | "qualified" | "closed" | "spam") {
  return { id: name, name, email: `${name}@example.test`, company: "测试公司", status, inquiryType: "catalog", createdAt: "2099-01-01T00:00:00.000Z" };
}
