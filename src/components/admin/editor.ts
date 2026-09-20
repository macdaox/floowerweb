import { initializeGalleryEditor } from "./GalleryEditor";
import { openMediaPicker, type MediaItem } from "./MediaPicker";

export type ContentEntity = "products" | "categories" | "spaces" | "articles" | "pages";
export type ContentRecord = Record<string, unknown> & { id?: string; updatedAt?: string; status?: string };

export type ContentEditorController = {
  requestClose: () => boolean;
  dispose: () => void;
};

type Field = {
  name: string;
  label: string;
  kind?: "input" | "textarea" | "number" | "select" | "media" | "pageSections";
  required?: boolean;
  rows?: number;
};

type EditorOptions = {
  entity: ContentEntity;
  record?: ContentRecord;
  onSaved?: (record: ContentRecord) => void;
  onClosed?: () => void;
};

const fields: Record<ContentEntity, Field[]> = {
  products: [
    { name: "name", label: "名称", required: true }, { name: "slug", label: "Slug", required: true },
    { name: "productCode", label: "产品编号", required: true }, { name: "categoryId", label: "分类", kind: "select", required: true },
    { name: "summary", label: "摘要", kind: "textarea", rows: 3 }, { name: "body", label: "正文", kind: "textarea", rows: 7 },
    { name: "specifications", label: "规格 JSON", kind: "textarea", rows: 4, required: true },
    { name: "seoTitle", label: "SEO 标题" }, { name: "seoDescription", label: "SEO 描述", kind: "textarea", rows: 2 },
  ],
  categories: [
    { name: "name", label: "名称", required: true }, { name: "slug", label: "Slug", required: true },
    { name: "description", label: "描述", kind: "textarea", rows: 4 }, { name: "sortOrder", label: "排序", kind: "number" },
    { name: "coverMediaId", label: "封面媒体", kind: "media" },
    { name: "seoTitle", label: "SEO 标题" }, { name: "seoDescription", label: "SEO 描述", kind: "textarea", rows: 2 },
  ],
  spaces: [
    { name: "title", label: "标题", required: true }, { name: "slug", label: "Slug", required: true },
    { name: "category", label: "分类", required: true }, { name: "location", label: "地点" },
    { name: "summary", label: "摘要", kind: "textarea", rows: 3 }, { name: "body", label: "正文", kind: "textarea", rows: 7 },
    { name: "seoTitle", label: "SEO 标题" }, { name: "seoDescription", label: "SEO 描述", kind: "textarea", rows: 2 },
  ],
  articles: [
    { name: "title", label: "标题", required: true }, { name: "slug", label: "Slug", required: true },
    { name: "author", label: "作者" }, { name: "summary", label: "摘要", kind: "textarea", rows: 3 },
    { name: "body", label: "正文", kind: "textarea", rows: 8 }, { name: "seoTitle", label: "SEO 标题" },
    { name: "coverMediaId", label: "封面媒体", kind: "media" }, { name: "seoDescription", label: "SEO 描述", kind: "textarea", rows: 2 },
  ],
  pages: [
    { name: "pageKey", label: "页面键", required: true }, { name: "sections", label: "区块 JSON", kind: "pageSections", rows: 12, required: true },
    { name: "seoTitle", label: "SEO 标题" }, { name: "seoDescription", label: "SEO 描述", kind: "textarea", rows: 2 },
  ],
};

const activeEditors = new WeakMap<HTMLElement, ContentEditorController>();

export function initializeContentEditor(root: HTMLElement, options?: EditorOptions): ContentEditorController {
  const existing = activeEditors.get(root);
  if (existing) return existing;
  root.dataset.initialized = "true";
  const entity = options?.entity ?? (root.dataset.contentEntity as ContentEntity | undefined) ?? "products";
  let record: ContentRecord = options?.record ?? {};
  let dirty = false;
  let submitting = false;

  const heading = document.createElement("h2");
  heading.textContent = record.id ? "编辑内容" : "新建内容";
  const close = button("关闭", "admin-secondary-button");
  close.setAttribute("aria-label", "关闭编辑器");
  const header = document.createElement("header");
  header.className = "content-editor__header";
  header.appendChild(heading);
  header.appendChild(close);
  const form = document.createElement("form");
  form.className = "content-editor__form";
  form.noValidate = true;
  const fieldset = document.createElement("div");
  fieldset.className = "content-editor__fields";
  form.appendChild(fieldset);
  const fieldErrors = new Map<string, HTMLElement>();

  for (const field of fields[entity]) {
    const group = document.createElement("div");
    group.className = field.kind === "textarea" ? "content-editor__field content-editor__field--wide" : "content-editor__field";
    const label = document.createElement("label");
    label.textContent = field.label;
    const control = createControl(field);
    control.name = field.name;
    control.id = `content-${entity}-${field.name}`;
    control.required = field.required ?? false;
    setValue(control, field.name, record[field.name]);
    label.htmlFor = control.id;
    const error = document.createElement("span");
    error.className = "content-editor__field-error";
    error.dataset.fieldError = field.name;
    error.setAttribute("role", "alert");
    group.appendChild(label);
    group.appendChild(control);
    if (field.kind === "media") addMediaPickerControls(group, control as HTMLInputElement);
    if (field.kind === "pageSections") addPageMediaControls(group, control as HTMLTextAreaElement);
    group.appendChild(error);
    fieldset.appendChild(group);
    fieldErrors.set(field.name, error);
  }

  const save = button("保存草稿", "admin-primary-button");
  save.type = "submit";
  const preview = actionButton("预览", "preview");
  const publish = actionButton("发布", "publish");
  const unpublish = actionButton("取消发布", "unpublish");
  const archive = actionButton("归档", "archive");
  const actions = document.createElement("div");
  actions.className = "content-editor__actions";
  for (const control of [save, preview, publish, unpublish, archive]) actions.appendChild(control);
  form.appendChild(actions);
  const message = document.createElement("p");
  message.dataset.editorStatus = "";
  message.className = "content-editor__status";
  message.setAttribute("role", "status");
  message.setAttribute("aria-live", "polite");
  const gallery = document.createElement("section");
  gallery.hidden = entity !== "products" && entity !== "spaces";
  root.replaceChildren(header, form, message, gallery);
  syncActions();
  syncGallery();
  const categoryControl = form.elements.namedItem("categoryId");
  if (entity === "products" && categoryControl instanceof HTMLSelectElement) void loadCategoryOptions(categoryControl, record.categoryId);

  form.addEventListener("input", () => { dirty = true; clearErrors(); });
  form.addEventListener("submit", (event) => { event.preventDefault(); void saveRecord(); });
  const unload = (event: BeforeUnloadEvent) => {
    if (!dirty) return;
    event.preventDefault();
    event.returnValue = "";
  };
  let disposed = false;
  const controller: ContentEditorController = {
    requestClose: () => {
      if (dirty && !window.confirm("有未保存的更改，确定关闭吗？")) return false;
      controller.dispose();
      return true;
    },
    dispose: () => {
      if (disposed) return;
      disposed = true;
      dirty = false;
      window.removeEventListener("beforeunload", unload);
      activeEditors.delete(root);
      delete root.dataset.initialized;
    },
  };
  activeEditors.set(root, controller);
  close.addEventListener("click", () => { if (controller.requestClose()) options?.onClosed?.(); });
  preview.addEventListener("click", () => void performAction("preview"));
  publish.addEventListener("click", () => void performAction("publish"));
  unpublish.addEventListener("click", () => void performAction("unpublish"));
  archive.addEventListener("click", () => void performAction("archive"));
  window.addEventListener("beforeunload", unload);

  return controller;

  async function saveRecord(): Promise<void> {
    if (submitting) return;
    submitting = true;
    setBusy(true);
    clearErrors();
    try {
      const data = readForm(form, entity);
      const creating = !record.id;
      const endpoint = creating ? `/api/admin/${entity}` : `/api/admin/${entity}/${encodeURIComponent(record.id ?? "")}`;
      const payload = creating ? { version: 1, data } : { version: 1, updatedAt: record.updatedAt, data };
      const next = await request(endpoint, creating ? "POST" : "PUT", payload);
      record = next;
      dirty = false;
      message.setAttribute("role", "status");
      message.textContent = "已保存。";
      heading.textContent = "编辑内容";
      syncActions();
      syncGallery();
      options?.onSaved?.(record);
    } catch (error) {
      showError(error);
    } finally {
      submitting = false;
      setBusy(false);
    }
  }

  async function performAction(action: "preview" | "publish" | "unpublish" | "archive"): Promise<void> {
    if (!record.id || submitting) return;
    if (dirty) {
      message.setAttribute("role", "alert");
      message.textContent = "请先保存更改，再执行此操作。";
      return;
    }
    const popup = action === "preview" ? window.open("about:blank", "_blank") : null;
    submitting = true;
    setBusy(true);
    clearErrors();
    try {
      const next = await request(`/api/admin/${entity}/${encodeURIComponent(record.id)}`, "POST", { version: 1, action, updatedAt: record.updatedAt });
      if (action === "preview") {
        if (popup && typeof next.url === "string") popup.location.href = next.url;
        else popup?.close();
        message.setAttribute("role", "status");
        message.textContent = "预览已打开。";
      } else {
        popup?.close();
        record = next;
        dirty = false;
        message.setAttribute("role", "status");
        message.textContent = action === "publish" ? "已发布。" : action === "unpublish" ? "已取消发布。" : "已归档。";
        syncActions();
        options?.onSaved?.(record);
      }
    } catch (error) {
      popup?.close();
      showError(error);
    } finally {
      submitting = false;
      setBusy(false);
    }
  }

  function syncActions(): void {
    const saved = Boolean(record.id);
    preview.hidden = !saved;
    publish.hidden = !saved || record.status === "published" || record.status === "archived";
    unpublish.hidden = !saved || record.status !== "published";
    archive.hidden = !saved || record.status === "archived";
  }

  function syncGallery(): void {
    if ((entity !== "products" && entity !== "spaces") || !record.id) {
      gallery.hidden = true;
      return;
    }
    gallery.hidden = false;
    initializeGalleryEditor(gallery, { entity: entity === "products" ? "product" : "space", contentId: record.id });
  }

  function setBusy(value: boolean): void {
    for (const control of [save, preview, publish, unpublish, archive]) control.disabled = value;
  }

  function clearErrors(): void {
    for (const error of fieldErrors.values()) error.textContent = "";
  }

  function showError(error: unknown): void {
    const apiError = error as ApiError;
    message.textContent = apiError.message ?? "操作失败，请重试。";
    message.setAttribute("role", "alert");
    for (const [field, value] of Object.entries(apiError.fields ?? {})) fieldErrors.get(field)?.replaceChildren(value);
  }
}

type ApiError = Error & { fields?: Record<string, string> };

async function request(endpoint: string, method: string, payload: unknown): Promise<ContentRecord> {
  const response = await fetch(endpoint, { method, headers: { "content-type": "application/json", accept: "application/json" }, body: JSON.stringify(payload) });
  const body = await response.json() as { ok: boolean; data?: ContentRecord; error?: { message?: string; fields?: Record<string, string> } };
  if (!response.ok || !body.ok || !body.data) {
    const error = new Error(body.error?.message ?? "操作失败，请重试。") as ApiError;
    error.fields = body.error?.fields;
    throw error;
  }
  return body.data;
}

function readForm(form: HTMLFormElement, entity: ContentEntity): Record<string, unknown> {
  const output: Record<string, unknown> = {};
  for (const field of fields[entity]) {
    const control = form.elements.namedItem(field.name) as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null;
    if (!control) continue;
    if (field.kind === "number") output[field.name] = control.value ? Number(control.value) : 0;
    else if (field.name === "specifications" || field.name === "sections") {
      try { output[field.name] = JSON.parse(control.value || (field.name === "sections" ? "[]" : "{}")) as unknown; }
      catch { const error = new Error(`${field.label} 必须是有效的 JSON。`) as ApiError; error.fields = { [field.name]: "请输入有效的 JSON。" }; throw error; }
    } else output[field.name] = control.value;
  }
  return output;
}

function createControl(field: Field): HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement {
  if (field.kind === "textarea" || field.kind === "pageSections") { const control = document.createElement("textarea"); control.rows = field.rows ?? 4; return control; }
  if (field.kind === "select") { const control = document.createElement("select"); const option = document.createElement("option"); option.value = ""; option.textContent = "选择分类"; control.appendChild(option); return control; }
  const control = document.createElement("input");
  if (field.kind === "media") control.readOnly = true;
  control.type = field.kind === "number" ? "number" : "text";
  if (field.kind === "number") { control.min = "0"; control.step = "1"; }
  return control;
}

function addMediaPickerControls(group: HTMLElement, control: HTMLInputElement): void {
  const choose = button("从媒体库选择封面", "admin-secondary-button");
  const clear = button("清除封面", "admin-link-button");
  choose.addEventListener("click", async () => {
    const selected = await openMediaPicker();
    if (!selected) return;
    control.value = selected.id;
    control.dispatchEvent(new Event("input", { bubbles: true }));
  });
  clear.addEventListener("click", () => {
    control.value = "";
    control.dispatchEvent(new Event("input", { bubbles: true }));
  });
  group.appendChild(choose);
  group.appendChild(clear);
}

function addPageMediaControls(group: HTMLElement, control: HTMLTextAreaElement): void {
  const choose = button("从媒体库添加图片区块", "admin-secondary-button");
  choose.addEventListener("click", async () => {
    let sections: unknown;
    try { sections = JSON.parse(control.value || "[]"); } catch { sections = []; }
    const selected = await openMediaPicker();
    if (!selected) return;
    control.value = JSON.stringify(appendPageMediaBlock(sections, selected), null, 2);
    control.dispatchEvent(new Event("input", { bubbles: true }));
  });
  group.appendChild(choose);
}

export function appendPageMediaBlock(sections: unknown, media: MediaItem): unknown[] {
  const current = Array.isArray(sections) ? sections : [];
  return [...current, {
    type: "imageText", title: "New image section", body: "Add section copy.",
    image: { src: media.url, alt: media.altText || media.originalFilename },
  }];
}

function setValue(control: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, name: string, value: unknown): void {
  if (name === "specifications") control.value = JSON.stringify(value ?? {}, null, 2);
  else if (name === "sections") control.value = JSON.stringify(value ?? [{ type: "hero", title: "" }], null, 2);
  else if (value !== undefined && value !== null) control.value = String(value);
}

async function loadCategoryOptions(select: HTMLSelectElement, selected: unknown): Promise<void> {
  try {
    for (const category of await loadAllContentRecords("categories")) {
      const option = document.createElement("option");
      option.value = String(category.id);
      option.textContent = String(category.name ?? category.id);
      option.selected = category.id === selected;
      select.appendChild(option);
    }
  } catch {
    // The save endpoint will return a field error if no category can be loaded.
  }
}

export async function loadAllContentRecords(entity: ContentEntity): Promise<ContentRecord[]> {
  const items: ContentRecord[] = [];
  let page = 1;
  let totalPages = 1;
  do {
    const query = new URLSearchParams({ page: String(page), pageSize: "100", order: "name", direction: "asc" });
    const response = await fetch(`/api/admin/${entity}?${query}`);
    const body = await response.json() as { ok: boolean; data?: { items: ContentRecord[]; totalPages: number }; error?: { message?: string } };
    if (!response.ok || !body.ok || !body.data) throw new Error(body.error?.message ?? "Unable to load content options.");
    items.push(...body.data.items);
    totalPages = body.data.totalPages;
    page += 1;
  } while (page <= totalPages);
  return items;
}

function button(label: string, className = ""): HTMLButtonElement {
  const element = document.createElement("button");
  element.type = "button";
  element.textContent = label;
  element.className = className;
  return element;
}

function actionButton(label: string, action: string): HTMLButtonElement {
  const element = button(label, "admin-secondary-button");
  element.dataset.editorAction = action;
  return element;
}
