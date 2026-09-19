import { expect, test, type Page } from "@playwright/test";

test("an editor creates, previews, publishes, and archives content with dirty-form protection", async ({ page }) => {
  await loginAsEditor(page);

  await page.goto("/admin/categories");
  await page.getByRole("button", { name: "新建分类" }).click();
  await page.getByLabel("名称").fill("E2E Botanicals");
  await page.getByLabel("Slug").fill("e2e-botanicals");
  await page.getByLabel("描述", { exact: true }).fill("A category created in the browser flow.");
  await page.getByRole("button", { name: "保存草稿" }).click();
  await expect(page.locator("[data-editor-status]")).toContainText("已保存");

  await page.goto("/admin/products");
  await page.getByRole("button", { name: "新建产品" }).click();
  await page.getByLabel("名称").fill("E2E Magnolia Stem");
  await page.getByLabel("Slug").fill("e2e-magnolia-stem");
  await page.getByLabel("产品编号").fill("E2E-MAGNOLIA");
  await page.getByLabel("分类", { exact: true }).selectOption({ label: "E2E Botanicals" });
  await page.getByLabel("摘要").fill("A browser-created artificial magnolia stem.");
  await page.getByLabel("正文").fill("A complete browser-created product description.");
  await page.getByLabel("规格 JSON").fill('{"material":"Silk"}');
  await page.getByRole("button", { name: "保存草稿" }).click();
  await expect(page.locator("[data-editor-status]")).toContainText("已保存");

  const preview = page.waitForEvent("popup");
  await page.getByRole("button", { name: "预览" }).click();
  const previewPage = await preview;
  await expect(previewPage.getByRole("heading", { name: "E2E Magnolia Stem" })).toBeVisible();
  expect(previewPage.url()).toContain("preview=");
  await previewPage.close();

  await page.getByRole("button", { name: "发布" }).click();
  await expect(page.locator("[data-editor-status]")).toContainText("已发布");
  await page.getByRole("button", { name: "归档" }).click();
  await expect(page.locator("[data-editor-status]")).toContainText("已归档");

  await page.goto("/admin/categories");
  await page.getByRole("searchbox").fill("E2E Botanicals");
  const categoryRow = page.getByRole("row", { name: /E2E Botanicals/ });
  await categoryRow.getByRole("button", { name: "编辑" }).click();
  await page.getByLabel("描述", { exact: true }).fill("An edited browser category.");
  await page.getByRole("button", { name: "保存草稿" }).click();
  await expect(page.locator("[data-editor-status]")).toContainText("已保存");
  await openPreview(page, "E2E Botanicals");
  await page.getByRole("button", { name: "发布" }).click();
  await expect(page.locator("[data-editor-status]")).toContainText("已发布");
  await page.getByRole("button", { name: "归档" }).click();
  await expect(page.locator("[data-editor-status]")).toContainText("已归档");

  await page.getByRole("button", { name: "关闭编辑器" }).click();
  await page.getByRole("searchbox").fill("e2e-bulk-category-001");
  await page.getByRole("row", { name: /E2E Bulk Category 001/ }).getByRole("button", { name: "编辑" }).click();
  await page.getByLabel("描述", { exact: true }).fill("Unsaved category switch");
  await page.getByRole("searchbox").fill("e2e-bulk-category-002");
  const secondEdit = page.getByRole("row", { name: /E2E Bulk Category 002/ }).getByRole("button", { name: "编辑" });

  let dialogPromise = page.waitForEvent("dialog", { timeout: 5_000 });
  let clickPromise = secondEdit.evaluate((button: HTMLButtonElement) => button.click());
  let dialog = await dialogPromise;
  expect(dialog.type()).toBe("confirm");
  await dialog.dismiss();
  await clickPromise;
  await expect(page.getByLabel("描述", { exact: true })).toHaveValue("Unsaved category switch");

  dialogPromise = page.waitForEvent("dialog", { timeout: 5_000 });
  clickPromise = secondEdit.evaluate((button: HTMLButtonElement) => button.click());
  dialog = await dialogPromise;
  await dialog.accept();
  await clickPromise;
  await expect(page.getByLabel("名称")).toHaveValue("E2E Bulk Category 002");
  await page.getByRole("button", { name: "关闭编辑器" }).click();

  let leakedUnloadGuard = false;
  const detectLeakedGuard = async (unexpected: import("@playwright/test").Dialog) => { leakedUnloadGuard = true; await unexpected.dismiss(); };
  page.on("dialog", detectLeakedGuard);
  await page.getByRole("link", { name: "仪表盘" }).click();
  page.off("dialog", detectLeakedGuard);
  await expect(page).toHaveURL(/\/admin$/);
  expect(leakedUnloadGuard).toBe(false);

  await page.goto("/admin/products");
  await page.getByRole("button", { name: "新建产品" }).click();
  await expect(page.getByLabel("分类", { exact: true }).locator("option", { hasText: "E2E Bulk Category 105" })).toHaveCount(1);
  await page.getByRole("button", { name: "关闭编辑器" }).click();

  await page.goto("/admin/spaces");
  await expect(page.getByLabel("分类筛选").locator("option", { hasText: "E2E Space Category 105" })).toHaveCount(1);
  await page.getByRole("button", { name: "新建案例" }).click();
  await page.getByLabel("标题", { exact: true }).fill("Unsaved lobby");
  page.once("dialog", async (dialog) => { expect(dialog.type()).toBe("beforeunload"); await dialog.dismiss(); });
  await page.getByRole("link", { name: "期刊内容" }).click();
  await expect(page).toHaveURL(/\/admin\/spaces/);
});

test("spaces, articles, and pages support lifecycle actions and surface a real optimistic edit conflict", async ({ page }) => {
  await loginAsEditor(page);

  await page.goto("/admin/spaces");
  await page.getByRole("button", { name: "新建案例" }).click();
  await page.getByLabel("标题", { exact: true }).fill("E2E Quiet Lobby");
  await page.getByLabel("Slug").fill("e2e-quiet-lobby");
  await page.getByLabel("分类", { exact: true }).fill("Hospitality");
  await page.getByLabel("摘要").fill("A long-lived lobby installation.");
  await page.getByLabel("正文").fill("The full lobby case study.");
  await saveEditPublishArchive(page, "地点", "Guangzhou", "E2E Quiet Lobby");

  await page.goto("/admin/journal");
  await page.getByRole("button", { name: "新建文章" }).click();
  await page.getByLabel("标题", { exact: true }).fill("E2E Material Note");
  await page.getByLabel("Slug").fill("e2e-material-note");
  await page.getByLabel("作者").fill("EVERSTEM Studio");
  await page.getByLabel("摘要").fill("A browser-created note on materials.");
  await page.getByLabel("正文").fill("The complete browser-created journal article.");
  await saveEditPublishArchive(page, "作者", "EVERSTEM Editorial Team", "E2E Material Note");

  await page.goto("/admin/pages");
  await page.getByRole("button", { name: "新建页面" }).click();
  await page.getByLabel("页面键").fill("e2e-studio-page");
  await page.getByLabel("区块 JSON").fill('[{"type":"hero","title":"E2E Studio","body":"A modular browser page."}]');
  await page.getByLabel("SEO 标题").fill("E2E Studio");
  await page.getByLabel("SEO 描述").fill("A browser-created modular page.");
  await saveEditPublishArchive(page, "SEO 标题", "E2E Studio Page", "E2E Studio");

  await page.goto("/admin/categories");
  await page.getByRole("button", { name: "新建分类" }).click();
  await page.getByLabel("名称").fill("E2E Conflict Category");
  await page.getByLabel("Slug").fill("e2e-conflict-category");
  const createdResponse = page.waitForResponse((response) => response.request().method() === "POST" && response.url().endsWith("/api/admin/categories") && response.status() === 201);
  await page.getByRole("button", { name: "保存草稿" }).click();
  const created = await createdResponse;
  const createdBody = await created.json() as { data: { id: string; updatedAt: string } };
  const concurrentStatus = await page.evaluate(async ({ id, updatedAt }) => {
    const response = await fetch(`/api/admin/categories/${encodeURIComponent(id)}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ version: 1, updatedAt, data: { description: "Concurrent editor won." } }),
    });
    return response.status;
  }, { id: createdBody.data.id, updatedAt: createdBody.data.updatedAt });
  expect(concurrentStatus).toBe(200);
  await page.getByLabel("描述", { exact: true }).fill("Stale local edit.");
  await page.getByRole("button", { name: "保存草稿" }).click();
  await expect(page.locator("[data-editor-status]")).toContainText("changed since you opened it");
});

async function saveEditPublishArchive(page: Page, editLabel: string, editValue: string, previewHeading: string): Promise<void> {
  await page.getByRole("button", { name: "保存草稿" }).click();
  await expect(page.locator("[data-editor-status]")).toContainText("已保存");
  await openPreview(page, previewHeading);
  await page.getByLabel(editLabel, { exact: true }).fill(editValue);
  await page.getByRole("button", { name: "保存草稿" }).click();
  await expect(page.locator("[data-editor-status]")).toContainText("已保存");
  await page.getByRole("button", { name: "发布" }).click();
  await expect(page.locator("[data-editor-status]")).toContainText("已发布");
  await page.getByRole("button", { name: "归档" }).click();
  await expect(page.locator("[data-editor-status]")).toContainText("已归档");
  await page.getByRole("button", { name: "关闭编辑器" }).click();
}

async function openPreview(page: Page, heading: string): Promise<void> {
  const preview = page.waitForEvent("popup");
  await page.getByRole("button", { name: "预览" }).click();
  const previewPage = await preview;
  await expect(previewPage.getByRole("heading", { name: heading })).toBeVisible();
  expect(previewPage.url()).toContain("preview=");
  await expect(previewPage.locator('link[rel="canonical"]')).not.toHaveAttribute("href", /preview=/);
  expect((await previewPage.request.get(previewPage.url())).headers()["x-robots-tag"]).toBe("noindex, nofollow");
  await previewPage.close();
}

async function loginAsEditor(page: Page): Promise<void> {
  await page.goto("/admin/login");
  await login(page, "e2e-editor@everstem.test");
}

async function login(page: Page, email: string): Promise<void> {
  const password = process.env.E2E_ADMIN_PASSWORD;
  if (!password) throw new Error("E2E_ADMIN_PASSWORD must be set for authenticated browser tests.");
  await page.getByLabel("邮箱地址").fill(email);
  await page.getByLabel("密码").fill(password);
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page).toHaveURL(/\/admin$/);
}
