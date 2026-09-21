// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { appendPageMediaBlock, initializeContentEditor } from "../../src/components/admin/editor";

afterEach(() => { document.body.replaceChildren(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("admin content editor media reuse", () => {
  it("adds a selected library item to page sections without requiring a hand-written media path", () => {
    expect(appendPageMediaBlock([{ type: "hero", title: "Home" }], {
      id: "media-1", objectKey: "00000000-0000-4000-8000-000000000811.jpg", originalFilename: "magnolia.jpg",
      mimeType: "image/jpeg", byteSize: 10, altText: "White magnolia branch", url: "/media/00000000-0000-4000-8000-000000000811.jpg",
    })).toEqual([
      { type: "hero", title: "Home" },
      { type: "imageText", title: "New image section", body: "Add section copy.", image: { src: "/media/00000000-0000-4000-8000-000000000811.jpg", alt: "White magnolia branch" } },
    ]);
  });

  it("mounts a visual rich text editor for legacy product body content", () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ok: true, data: { items: [], totalPages: 1 } }))));
    const root = document.createElement("div");
    document.body.appendChild(root);
    const controller = initializeContentEditor(root, { entity: "products", record: { body: "First\n\nSecond" } });
    expect(root.querySelector('textarea[name="body"]')).toBeNull();
    expect(root.querySelector('.rich-text-editor__content')?.innerHTML).toBe("<p>First</p><p>Second</p>");
    expect(root.querySelector<HTMLInputElement>('input[type="hidden"][name="body"]')?.value).toBe("<p>First</p><p>Second</p>");
    controller.dispose();
  });
});
