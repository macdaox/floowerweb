// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { mountRichTextEditor } from "../../src/components/admin/RichTextEditor";
import { createInlineImageUpload } from "../../src/components/admin/InlineImageUpload";

afterEach(() => { document.body.replaceChildren(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("RichTextEditor", () => {
  it("mounts a Chinese toolbar and upgrades legacy paragraphs", () => {
    const root = document.createElement("div");
    document.body.appendChild(root);
    const controller = mountRichTextEditor(root, { value: "First\n\nSecond", onChange: vi.fn() });
    expect(root.querySelector('[aria-label="加粗"]')).not.toBeNull();
    expect(root.querySelector('[aria-label="无序列表"]')).not.toBeNull();
    expect(controller.getHtml()).toBe("<p>First</p><p>Second</p>");
    controller.destroy();
  });

  it("sanitizes programmatic content and reports changes", () => {
    const onChange = vi.fn();
    const root = document.createElement("div");
    document.body.appendChild(root);
    const controller = mountRichTextEditor(root, { value: "", onChange });
    controller.setHtml('<p onclick="x()">Safe<script>bad()</script></p>');
    expect(controller.getHtml()).toBe("<p>Safe</p>");
    expect(onChange).toHaveBeenLastCalledWith("<p>Safe</p>");
    controller.destroy();
    expect(root.childElementCount).toBe(0);
  });

  it("can execute formatting commands without losing content", () => {
    const root = document.createElement("div");
    document.body.appendChild(root);
    const controller = mountRichTextEditor(root, { value: "Words", onChange: vi.fn() });
    controller.focus();
    root.querySelector<HTMLButtonElement>('[aria-label="加粗"]')?.click();
    expect(controller.getHtml()).toContain("Words");
    controller.destroy();
  });

  it("reports pending uploads and inserts only successful images", async () => {
    vi.spyOn(window, "prompt").mockReturnValue("Green preserved fern");
    const uploaded = { id: "media-1", objectKey: "fern.webp", originalFilename: "fern.webp", mimeType: "image/webp", byteSize: 4, altText: "Green preserved fern", url: "/media/fern.webp" };
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ok: true, data: uploaded }), { status: 201 })));
    const onInsert = vi.fn();
    const onStateChange = vi.fn();
    const uploader = createInlineImageUpload({ onInsert, onStateChange });
    await uploader.handleFiles([new File(["fern"], "fern.webp", { type: "image/webp" })]);
    expect(onStateChange.mock.calls).toEqual([[true], [false]]);
    expect(onInsert).toHaveBeenCalledWith(uploaded);
    uploader.destroy();
  });

  it("does not insert a broken node when upload fails", async () => {
    vi.spyOn(window, "prompt").mockReturnValue("Fern");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ok: false, error: { message: "Upload failed" } }), { status: 500 })));
    const onInsert = vi.fn();
    const onError = vi.fn();
    const uploader = createInlineImageUpload({ onInsert, onError });
    await uploader.handleFiles([new File(["fern"], "fern.webp", { type: "image/webp" })]);
    expect(onInsert).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith("Upload failed");
    uploader.destroy();
  });
});
