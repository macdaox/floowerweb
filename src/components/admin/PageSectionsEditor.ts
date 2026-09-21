import { parsePageBlocks, type PageBlock } from "../../features/content/schemas";
import { openMediaPicker } from "./MediaPicker";
import { mountRichTextEditor, type RichTextEditorController } from "./RichTextEditor";

export type PageSectionsEditorController = {
  getValue(): PageBlock[];
  setValue(value: unknown): void;
  focus(): void;
  destroy(): void;
};

type Options = {
  value: unknown;
  onChange(value: PageBlock[]): void;
  onUploadStateChange?(uploading: boolean): void;
};

const names: Record<PageBlock["type"], string> = {
  hero: "首屏区块",
  richText: "富文本区块",
  imageText: "图文区块",
  capabilities: "能力列表",
  cta: "行动按钮",
  contactDetails: "联系信息",
};

export function mountPageSectionsEditor(root: HTMLElement, options: Options): PageSectionsEditorController {
  let blocks = parsePageBlocks(options.value);
  let destroyed = false;
  let nestedEditors: RichTextEditorController[] = [];
  root.classList.add("page-sections-editor");

  const controller: PageSectionsEditorController = {
    getValue: () => structuredClone(blocks),
    setValue: (value) => { blocks = parsePageBlocks(value); render(); },
    focus: () => root.querySelector<HTMLElement>("input, textarea, select, button")?.focus(),
    destroy: () => { destroyed = true; nestedEditors.forEach((editor) => editor.destroy()); nestedEditors = []; root.replaceChildren(); root.classList.remove("page-sections-editor"); },
  };
  render();
  return controller;

  function commit(): void {
    blocks = parsePageBlocks(blocks);
    options.onChange(structuredClone(blocks));
  }

  function render(): void {
    if (destroyed) return;
    nestedEditors.forEach((editor) => editor.destroy());
    nestedEditors = [];
    root.replaceChildren();
    const list = document.createElement("div");
    list.className = "page-sections-editor__list";
    blocks.forEach((block, index) => list.appendChild(card(block, index)));
    const addRow = document.createElement("div");
    addRow.className = "page-sections-editor__add";
    const select = document.createElement("select");
    select.setAttribute("aria-label", "选择区块类型");
    for (const [type, label] of Object.entries(names)) {
      const option = document.createElement("option"); option.value = type; option.textContent = label; select.appendChild(option);
    }
    const add = action("添加区块", "添加区块");
    add.addEventListener("click", () => { blocks.push(defaultBlock(select.value as PageBlock["type"])); commit(); render(); });
    addRow.appendChild(select); addRow.appendChild(add);
    root.appendChild(list); root.appendChild(addRow);
  }

  function card(block: PageBlock, index: number): HTMLElement {
    const section = document.createElement("section");
    section.className = "page-sections-editor__card";
    const header = document.createElement("header");
    const title = document.createElement("h3"); title.textContent = names[block.type];
    const up = action("上移", "上移区块"); up.disabled = index === 0;
    const down = action("下移", "下移区块"); down.disabled = index === blocks.length - 1;
    const remove = action("删除", "删除区块");
    up.addEventListener("click", () => move(index, index - 1));
    down.addEventListener("click", () => move(index, index + 1));
    remove.addEventListener("click", () => { blocks.splice(index, 1); commit(); render(); });
    header.appendChild(title); header.appendChild(up); header.appendChild(down); header.appendChild(remove);
    section.appendChild(header);

    if (block.type === "hero") {
      field(section, "眉题", block.eyebrow ?? "", (value) => { block.eyebrow = value || undefined; });
      field(section, "标题", block.title, (value) => { block.title = value; });
      field(section, "正文", block.body ?? "", (value) => { block.body = value || undefined; }, true);
      imageField(section, block, true);
    } else if (block.type === "richText") {
      field(section, "区块标题", block.heading ?? "", (value) => { block.heading = value || undefined; });
      const host = document.createElement("div");
      section.appendChild(host);
      const legacy = block.html ?? block.document?.content.map((paragraph) => paragraph.content?.map((node) => node.text).join("") ?? "").join("\n\n") ?? "";
      nestedEditors.push(mountRichTextEditor(host, {
        value: legacy,
        onChange: (html) => { block.html = html; delete block.document; commit(); },
        onUploadStateChange: options.onUploadStateChange,
      }));
    } else if (block.type === "imageText") {
      field(section, "眉题", block.eyebrow ?? "", (value) => { block.eyebrow = value || undefined; });
      field(section, "标题", block.title, (value) => { block.title = value; });
      field(section, "正文", block.body, (value) => { block.body = value; }, true);
      imageField(section, block, false);
      checkbox(section, "图片与文字反向排列", block.reversed ?? false, (value) => { block.reversed = value; });
    } else if (block.type === "capabilities") {
      field(section, "眉题", block.eyebrow ?? "", (value) => { block.eyebrow = value || undefined; });
      field(section, "标题", block.title, (value) => { block.title = value; });
      field(section, "列表（每行一项）", block.items.join("\n"), (value) => { block.items = value.split("\n").map((item) => item.trim()).filter(Boolean); }, true);
    } else if (block.type === "cta") {
      field(section, "眉题", block.eyebrow ?? "", (value) => { block.eyebrow = value || undefined; });
      field(section, "标题", block.title, (value) => { block.title = value; });
      field(section, "正文", block.body ?? "", (value) => { block.body = value || undefined; }, true);
      field(section, "按钮文字", block.label, (value) => { block.label = value; });
      field(section, "站内链接", block.href, (value) => { block.href = value; });
    } else {
      field(section, "标题", block.title, (value) => { block.title = value; });
      field(section, "邮箱", block.email ?? "", (value) => { block.email = value || undefined; });
      field(section, "电话", block.phone ?? "", (value) => { block.phone = value || undefined; });
      field(section, "地址", block.address ?? "", (value) => { block.address = value || undefined; }, true);
      field(section, "营业时间", block.hours ?? "", (value) => { block.hours = value || undefined; });
    }
    return section;
  }

  function field(parent: HTMLElement, labelText: string, value: string, update: (value: string) => void, multiline = false): void {
    const label = document.createElement("label"); label.textContent = labelText;
    const input = multiline ? document.createElement("textarea") : document.createElement("input");
    input.value = value;
    input.addEventListener("input", () => { update(input.value); try { commit(); } catch { /* retain invalid in-progress text until corrected */ } });
    label.appendChild(input); parent.appendChild(label);
  }

  function checkbox(parent: HTMLElement, labelText: string, value: boolean, update: (value: boolean) => void): void {
    const label = document.createElement("label"); const input = document.createElement("input"); input.type = "checkbox"; input.checked = value;
    input.addEventListener("change", () => { update(input.checked); commit(); });
    label.appendChild(input); label.append(labelText); parent.appendChild(label);
  }

  function imageField(parent: HTMLElement, block: Extract<PageBlock, { type: "hero" | "imageText" }>, optional: boolean): void {
    const preview = document.createElement("p"); preview.textContent = block.image ? `${block.image.alt} · ${block.image.src}` : "尚未选择图片";
    const choose = action("上传或选择图片", "选择区块图片");
    choose.addEventListener("click", async () => {
      options.onUploadStateChange?.(true);
      try {
        const media = await openMediaPicker();
        if (!media) return;
        block.image = { src: media.url, alt: media.altText || media.originalFilename };
        commit(); render();
      } finally { options.onUploadStateChange?.(false); }
    });
    parent.appendChild(preview); parent.appendChild(choose);
    if (optional && block.image) {
      const clear = action("清除图片", "清除区块图片");
      clear.addEventListener("click", () => { block.image = undefined; commit(); render(); });
      parent.appendChild(clear);
    }
  }

  function move(from: number, to: number): void {
    const [block] = blocks.splice(from, 1); if (!block) return; blocks.splice(to, 0, block); commit(); render();
  }
}

function action(text: string, aria: string): HTMLButtonElement {
  const button = document.createElement("button"); button.type = "button"; button.textContent = text; button.setAttribute("aria-label", aria); return button;
}

function defaultBlock(type: PageBlock["type"]): PageBlock {
  switch (type) {
    case "hero": return { type, title: "New hero" };
    case "richText": return { type, document: { type: "doc", content: [{ type: "paragraph" }] } };
    case "imageText": return { type, title: "New image section", body: "Add section copy.", image: { src: "/assets/placeholder.jpg", alt: "Botanical detail" } };
    case "capabilities": return { type, title: "Capabilities", items: ["New capability"] };
    case "cta": return { type, title: "Start a conversation", label: "Contact us", href: "/contact" };
    case "contactDetails": return { type, title: "Contact" };
  }
}
