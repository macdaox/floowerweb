import { Editor } from "@tiptap/core";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import StarterKit from "@tiptap/starter-kit";
import { legacyTextToRichHtml, normalizeRichText } from "../../features/rich-text/schema";
import { createInlineImageUpload } from "./InlineImageUpload";

export type RichTextEditorController = {
  getHtml(): string;
  setHtml(html: string): void;
  focus(): void;
  destroy(): void;
};

type Options = {
  value: string;
  onChange(html: string): void;
  onUploadStateChange?(uploading: boolean): void;
};

const MediaImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      "data-media-id": {
        default: null,
        parseHTML: (element) => element.getAttribute("data-media-id"),
        renderHTML: (attributes) => attributes["data-media-id"] ? { "data-media-id": attributes["data-media-id"] } : {},
      },
    };
  },
});

export function mountRichTextEditor(root: HTMLElement, options: Options): RichTextEditorController {
  root.replaceChildren();
  root.classList.add("rich-text-editor");
  const toolbar = document.createElement("div");
  toolbar.className = "rich-text-editor__toolbar";
  toolbar.setAttribute("role", "toolbar");
  const canvas = document.createElement("div");
  canvas.className = "rich-text-editor__canvas";
  const status = document.createElement("p");
  status.className = "rich-text-editor__status";
  status.setAttribute("aria-live", "polite");
  root.appendChild(toolbar);
  root.appendChild(canvas);
  root.appendChild(status);

  const initial = /<\/?[a-z][\s\S]*>/iu.test(options.value) ? normalizeRichText(options.value) : legacyTextToRichHtml(options.value);
  const editor = new Editor({
    element: canvas,
    extensions: [
      StarterKit.configure({ link: false }),
      Link.configure({ openOnClick: false }),
      MediaImage.configure({ inline: false, allowBase64: false }),
    ],
    content: initial,
    editorProps: {
      transformPastedHTML: (html) => normalizeRichText(html),
      attributes: { class: "rich-text-editor__content", "aria-label": "正文" },
    },
    onUpdate: ({ editor: current }) => options.onChange(normalizeRichText(current.getHTML())),
  });

  const uploader = createInlineImageUpload({
    onStateChange: (uploading) => {
      status.textContent = uploading ? "正在上传图片…" : "";
      options.onUploadStateChange?.(uploading);
    },
    onError: (message) => { status.textContent = message; status.setAttribute("role", "alert"); },
    onInsert: (item) => {
      status.removeAttribute("role");
      editor.chain().focus().setImage({ src: item.url, alt: item.altText ?? "", "data-media-id": item.id } as never).run();
    },
  });

  const buttons: Array<[string, string, () => void]> = [
    ["普通段落", "正文", () => { editor.chain().focus().setParagraph().run(); }],
    ["二级标题", "H2", () => { editor.chain().focus().toggleHeading({ level: 2 }).run(); }],
    ["三级标题", "H3", () => { editor.chain().focus().toggleHeading({ level: 3 }).run(); }],
    ["加粗", "B", () => { editor.chain().focus().toggleBold().run(); }],
    ["斜体", "I", () => { editor.chain().focus().toggleItalic().run(); }],
    ["无序列表", "项目符号", () => { editor.chain().focus().toggleBulletList().run(); }],
    ["有序列表", "编号", () => { editor.chain().focus().toggleOrderedList().run(); }],
    ["引用", "引用", () => { editor.chain().focus().toggleBlockquote().run(); }],
    ["链接", "链接", () => {
      const href = window.prompt("请输入链接地址", "https://")?.trim();
      if (href) editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
    }],
    ["撤销", "撤销", () => { editor.chain().focus().undo().run(); }],
    ["重做", "重做", () => { editor.chain().focus().redo().run(); }],
    ["插入图片", "图片", () => uploader.choose()],
  ];
  for (const [label, text, command] of buttons) {
    const button = document.createElement("button");
    button.type = "button";
    button.setAttribute("aria-label", label);
    button.textContent = text;
    button.addEventListener("click", command);
    toolbar.appendChild(button);
  }

  const drop = (event: DragEvent) => {
    if (!event.dataTransfer?.files.length) return;
    event.preventDefault();
    void uploader.handleFiles(event.dataTransfer.files);
  };
  const paste = (event: ClipboardEvent) => {
    if (!event.clipboardData?.files.length) return;
    event.preventDefault();
    void uploader.handleFiles(event.clipboardData.files);
  };
  canvas.addEventListener("drop", drop);
  canvas.addEventListener("paste", paste);

  return {
    getHtml: () => normalizeRichText(editor.getHTML()),
    setHtml: (html) => { editor.commands.setContent(normalizeRichText(html)); options.onChange(normalizeRichText(editor.getHTML())); },
    focus: () => { editor.commands.focus(); },
    destroy: () => {
      canvas.removeEventListener("drop", drop);
      canvas.removeEventListener("paste", paste);
      uploader.destroy();
      editor.destroy();
      root.replaceChildren();
      root.classList.remove("rich-text-editor");
    },
  };
}
