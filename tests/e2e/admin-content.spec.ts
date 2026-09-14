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

  await page.goto("/admin/spaces");
  await page.getByRole("button", { name: "新建案例" }).click();
  await page.getByLabel("标题", { exact: true }).fill("Unsaved lobby");
  page.once("dialog", async (dialog) => { expect(dialog.type()).toBe("beforeunload"); await dialog.dismiss(); });
  await page.getByRole("link", { name: "期刊内容" }).click();
  await expect(page).toHaveURL(/\/admin\/spaces/);
});

test("spaces, articles, and pages support create, optimistic edit, preview, publish, and archive", async ({ page }) => {
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
