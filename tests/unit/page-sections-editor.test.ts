// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { mountPageSectionsEditor } from "../../src/components/admin/PageSectionsEditor";
import { parsePageBlocks } from "../../src/features/content/schemas";

afterEach(() => { document.body.replaceChildren(); vi.restoreAllMocks(); });

describe("PageSectionsEditor", () => {
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

  it("rejects malformed or unsupported blocks", () => {
    const root = document.createElement("div");
    expect(() => mountPageSectionsEditor(root, { value: [{ type: "embed", url: "https://bad.test" }], onChange: vi.fn() })).toThrow(/unknown page block type/i);
  });
});
