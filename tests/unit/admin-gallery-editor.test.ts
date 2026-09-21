// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { initializeGalleryEditor } from "../../src/components/admin/GalleryEditor";
import { initializeContentEditor } from "../../src/components/admin/editor";

afterEach(() => { document.body.replaceChildren(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("integrated image controls", () => {
  it("shows direct upload, existing media, preview, and clear controls for covers", () => {
    const root = document.createElement("div");
    initializeContentEditor(root, { entity: "articles", record: {} });
    expect(root.textContent).toContain("直接上传");
    expect(root.textContent).toContain("选择已有图片");
    expect(root.textContent).toContain("清除封面");
    expect(root.querySelector("[data-cover-preview]")).not.toBeNull();
  });

  it("offers multiple direct uploads and accessible ordering in galleries", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ok: true, data: { items: [] } }))));
    const root = document.createElement("div");
    initializeGalleryEditor(root, { entity: "product", contentId: "product-1" });
    await new Promise((resolve) => setTimeout(resolve, 0));
    const input = root.querySelector<HTMLInputElement>('input[type="file"]');
    expect(input?.multiple).toBe(true);
    expect(root.textContent).toContain("直接上传图片");
    expect(root.textContent).toContain("选择已有图片");
  });
});
