import { expect, test, type Page } from "@playwright/test";

const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);

test("editor uploads reusable media, builds a product gallery, and cannot delete referenced media", async ({ page }) => {
  const run = crypto.randomUUID().slice(0, 8);
  const firstName = `e2e-magnolia-${run}-one.jpg`;
  const secondName = `e2e-magnolia-${run}-two.png`;
  await login(page, "e2e-editor@everstem.test");
  await page.goto("/admin/media");
  await expect(page.getByRole("heading", { name: "媒体库" })).toBeVisible();

  await upload(page, firstName, "image/jpeg", jpeg, "White magnolia branch");
  await upload(page, secondName, "image/png", png, "Open magnolia detail");
  await expect(page.locator("[data-media-card]", { hasText: firstName })).toBeVisible();
  await expect(page.locator("[data-media-card]", { hasText: secondName })).toBeVisible();

  await page.goto("/admin/products");
  await page.getByRole("button", { name: "新建产品" }).click();
  await page.getByLabel("名称").fill("E2E Media Product");
  await page.getByLabel("Slug").fill("e2e-media-product");
  await page.getByLabel("产品编号").fill("E2E-MEDIA-001");
  await page.getByLabel("分类", { exact: true }).selectOption({ label: "E2E Bulk Category 001" });
  await page.getByLabel("摘要").fill("A gallery-backed product.");
  await page.getByLabel("正文").fill("A complete gallery-backed product description.");
  await page.getByRole("button", { name: "保存草稿" }).click();
  await expect(page.locator("[data-editor-status]")).toContainText("已保存");

  await page.getByRole("button", { name: "从媒体库添加" }).click();
  await page.getByRole("dialog", { name: "选择媒体" }).getByRole("button", { name: `选择 ${firstName}` }).click();
  await page.getByLabel("图库图片 1 的替代文本").fill("White magnolia branch in a tall vase");
  await page.getByRole("button", { name: "从媒体库添加" }).click();
  await page.getByRole("dialog", { name: "选择媒体" }).getByRole("button", { name: `选择 ${secondName}` }).click();
  await page.getByLabel("图库图片 2 的替代文本").fill("Open magnolia bloom detail");
  await page.getByRole("button", { name: "设为封面 2" }).click();
  await page.getByRole("button", { name: "上移图片 2" }).click();
  await page.getByRole("button", { name: "保存图库" }).click();
  await expect(page.locator("[data-gallery-status]")).toContainText("图库已保存");
  await expect(page.locator("[data-gallery-item]").first()).toContainText(secondName);
  await expect(page.locator("[data-gallery-item]").first()).toContainText("封面");

  await page.goto("/admin/media");
  const referencedCard = page.locator("[data-media-card]", { hasText: secondName });
  page.once("dialog", (dialog) => dialog.accept());
  await referencedCard.getByRole("button", { name: "删除" }).click();
  await expect(referencedCard.getByRole("alert")).toContainText("正在被内容引用");
});

test("media upload validates real bytes and role access", async ({ page }) => {
  await login(page, "e2e-editor@everstem.test");
  await page.goto("/admin/media");
  await page.getByLabel("图片文件").setInputFiles({ name: "e2e-fake.jpg", mimeType: "image/jpeg", buffer: Buffer.from("not an image") });
  await page.getByLabel("默认替代文本").fill("Fake image");
  await page.getByRole("button", { name: "上传图片" }).click();
  await expect(page.getByRole("alert")).toContainText("JPG、PNG、WebP 或 AVIF");

  await page.getByRole("button", { name: "账户菜单" }).click();
  await page.getByRole("button", { name: "退出登录" }).click();
  await login(page, "e2e-sales@everstem.test");
  const status = await page.evaluate(async () => (await fetch("/api/admin/media")).status);
  expect(status).toBe(403);
});

async function upload(page: Page, name: string, mimeType: string, buffer: Buffer, altText: string): Promise<void> {
  await page.getByLabel("图片文件").setInputFiles({ name, mimeType, buffer });
  await page.getByLabel("默认替代文本").fill(altText);
  await page.getByRole("button", { name: "上传图片" }).click();
  await expect(page.locator("[data-media-status]")).toContainText("上传成功");
}

async function login(page: Page, email: string): Promise<void> {
  const password = process.env.E2E_ADMIN_PASSWORD;
  if (!password) throw new Error("E2E_ADMIN_PASSWORD must be set for authenticated browser tests.");
  await page.route("**/api/auth/login", async (route) => {
    await route.continue({ headers: { ...route.request().headers(), "cf-connecting-ip": `e2e-media-${crypto.randomUUID()}` } });
  }, { times: 1 });
  await page.goto("/admin/login");
  await page.getByLabel("邮箱地址").fill(email);
  await page.getByLabel("密码").fill(password);
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page).toHaveURL(/\/admin$/u);
}
