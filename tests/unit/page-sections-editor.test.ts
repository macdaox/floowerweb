// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { mountPageSectionsEditor } from "../../src/components/admin/PageSectionsEditor";
import { parsePageBlocks } from "../../src/features/content/schemas";

afterEach(() => { document.body.replaceChildren(); vi.restoreAllMocks(); });

describe("PageSectionsEditor", () => {
  it("offers direct image upload inside a page section", () => {
    const root = document.createElement("div");
    document.body.appendChild(root);
    const editor = mountPageSectionsEditor(root, { value: [{ type: "hero", title: "Home" }], onChange: vi.fn() });
    expect(root.querySelector('button[aria-label="直接上传区块图片"]')).not.toBeNull();
    editor.destroy();
  });
  it("renders supported blocks as Chinese forms and preserves their data", () => {
    const value = [
      { type: "hero", title: "About" },
      { type: "richText", heading: "Story", document: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Copy" }] }] } },
      { type: "imageText", title: "Craft", body: "Details", image: { src: "/assets/craft.jpg", alt: "Craft detail" } },
      { type: "capabilities", title: "Services", items: ["Design"] },
      { type: "cta", title: "Talk", label: "Contact", href: "/contact" },
      { type: "contactDetails", title: "Contact", email: "hello@example.com" },
    ];
    const root = document.createElement("div");
    const editor = mountPageSectionsEditor(root, { value, onChange: vi.fn() });
    expect(root.textContent).toContain("首屏区块");
    expect(root.textContent).toContain("富文本区块");
    expect(root.textContent).toContain("图文区块");
    expect(root.textContent).toContain("能力列表");
    expect(root.textContent).toContain("行动按钮");
    expect(root.textContent).toContain("联系信息");
    expect(root.querySelector('[aria-label="加粗"]')).not.toBeNull();
    expect(editor.getValue()).toEqual(parsePageBlocks(value));
    editor.destroy();
  });

  it("reorders blocks without editing JSON", () => {
    const onChange = vi.fn();
    const root = document.createElement("div");
    const editor = mountPageSectionsEditor(root, { value: [{ type: "hero", title: "First" }, { type: "hero", title: "Second" }], onChange });
    root.querySelectorAll<HTMLButtonElement>('[aria-label="上移区块"]')[1]?.click();
    expect(editor.getValue().map((block) => "title" in block ? block.title : "")).toEqual(["Second", "First"]);
    expect(onChange).toHaveBeenCalled();
    editor.destroy();
  });

  it("keeps editing the same block after a prior field change", () => {
    const root = document.createElement("div");
    const editor = mountPageSectionsEditor(root, { value: [{ type: "hero", title: "Original" }], onChange: vi.fn() });
    const inputs = root.querySelectorAll<HTMLInputElement>(".page-sections-editor__card input");
    inputs[1].value = "Updated";
    inputs[1].dispatchEvent(new Event("input"));
    const body = root.querySelector<HTMLTextAreaElement>(".page-sections-editor__card textarea");
    if (!body) throw new Error("Missing hero body field");
    body.value = "Later change";
    body.dispatchEvent(new Event("input"));
    expect(editor.getValue()[0]).toMatchObject({ title: "Updated", body: "Later change" });
    editor.destroy();
  });

  it("rejects malformed or unsupported blocks", () => {
    const root = document.createElement("div");
    expect(() => mountPageSectionsEditor(root, { value: [{ type: "embed", url: "https://bad.test" }], onChange: vi.fn() })).toThrow(/unknown page block type/i);
  });
});
