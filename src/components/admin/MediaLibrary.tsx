import type { MediaItem } from "./MediaPicker";

export function initializeMediaLibrary(root: HTMLElement): void {
  if (root.dataset.initialized) return;
  root.dataset.initialized = "true";
  const form = document.createElement("form");
  form.className = "media-library__upload";
  const fileLabel = label("图片文件", input("file", "file"));
  const fileInput = fileLabel.querySelector("input") as HTMLInputElement;
  fileInput.accept = ".jpg,.jpeg,.png,.webp,.avif,image/jpeg,image/png,image/webp,image/avif";
  const altLabel = label("默认替代文本", input("altText", "text"));
  const altInput = altLabel.querySelector("input") as HTMLInputElement;
  altInput.maxLength = 300;
  const upload = document.createElement("button");
  upload.type = "submit";
  upload.className = "admin-primary-button";
  upload.textContent = "上传图片";
  form.appendChild(fileLabel);
  form.appendChild(altLabel);
  form.appendChild(upload);
  const uploadStatus = document.createElement("p");
  uploadStatus.dataset.mediaStatus = "";
  uploadStatus.setAttribute("aria-live", "polite");
  const search = document.createElement("input");
  search.type = "search";
  search.placeholder = "搜索文件名或替代文本";
  search.setAttribute("aria-label", "搜索媒体");
  const grid = document.createElement("div");
  grid.className = "media-library__grid";
  const listStatus = document.createElement("p");
  listStatus.setAttribute("aria-live", "polite");
  root.replaceChildren(form, uploadStatus, search, listStatus, grid);
  let timer: number | undefined;

  form.addEventListener("submit", (event) => { event.preventDefault(); void submit(); });
  search.addEventListener("input", () => { window.clearTimeout(timer); timer = window.setTimeout(() => void load(), 200); });
  void load();

  async function submit(): Promise<void> {
    const selected = fileInput.files?.[0];
    if (!selected) {
      uploadStatus.setAttribute("role", "alert");
      uploadStatus.textContent = "请选择图片。";
      return;
    }
    upload.disabled = true;
    uploadStatus.removeAttribute("role");
    uploadStatus.textContent = "正在上传…";
    const data = new FormData();
    data.set("file", selected);
    data.set("altText", altInput.value);
    try {
      const response = await fetch("/api/admin/media", { method: "POST", body: data, headers: { accept: "application/json" } });
      const body = await response.json() as { ok: boolean; error?: { code?: string; message?: string; fields?: Record<string, string> } };
      if (!response.ok || !body.ok) {
        const message = body.error?.code === "unsupported_media_type" ? "仅支持有效的 JPG、PNG、WebP 或 AVIF 图片。" : body.error?.fields?.file ?? body.error?.message;
        throw new Error(message ?? "上传失败，请重试。");
      }
      form.reset();
      uploadStatus.textContent = "上传成功。";
      await load();
    } catch (error) {
      uploadStatus.setAttribute("role", "alert");
      uploadStatus.textContent = error instanceof Error ? error.message : "上传失败，请重试。";
    } finally {
      upload.disabled = false;
    }
  }

  async function load(): Promise<void> {
    listStatus.textContent = "正在加载媒体…";
    grid.replaceChildren();
    const query = new URLSearchParams({ pageSize: "100" });
    if (search.value.trim()) query.set("q", search.value.trim());
    try {
      const response = await fetch(`/api/admin/media?${query}`);
      const body = await response.json() as { ok: boolean; data?: { items: MediaItem[] }; error?: { message?: string } };
      if (!response.ok || !body.ok || !body.data) throw new Error(body.error?.message ?? "无法加载媒体。");
      listStatus.textContent = body.data.items.length ? `${body.data.items.length} 张图片` : "暂无媒体。";
      body.data.items.forEach(renderCard);
    } catch (error) {
      listStatus.setAttribute("role", "alert");
      listStatus.textContent = error instanceof Error ? error.message : "无法加载媒体。";
    }
  }

  function renderCard(item: MediaItem): void {
    const card = document.createElement("article");
    card.className = "media-library__card";
    card.dataset.mediaCard = "";
    const image = document.createElement("img");
    image.src = item.url;
    image.alt = item.altText || "";
    image.loading = "lazy";
    const name = document.createElement("strong");
    name.textContent = item.originalFilename;
    const metadata = document.createElement("span");
    metadata.textContent = `${item.mimeType} · ${formatBytes(item.byteSize)}`;
    const alt = document.createElement("p");
    alt.textContent = item.altText || "未填写默认替代文本";
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "admin-link-button";
    remove.textContent = "删除";
    const error = document.createElement("p");
    remove.addEventListener("click", () => void deleteItem(item, card, remove, error));
    card.appendChild(image);
    card.appendChild(name);
    card.appendChild(metadata);
    card.appendChild(alt);
    card.appendChild(remove);
    card.appendChild(error);
    grid.appendChild(card);
  }

  async function deleteItem(item: MediaItem, card: HTMLElement, remove: HTMLButtonElement, error: HTMLElement): Promise<void> {
    if (!window.confirm(`确定删除 ${item.originalFilename} 吗？此操作不可撤销。`)) return;
    remove.disabled = true;
    error.textContent = "正在删除…";
    error.removeAttribute("role");
    try {
      const response = await fetch(`/api/admin/media/${encodeURIComponent(item.id)}`, { method: "DELETE", headers: { accept: "application/json" } });
      const body = await response.json() as { ok: boolean; error?: { code?: string; message?: string } };
      if (!response.ok || !body.ok) {
        if (body.error?.code === "media_referenced") throw new Error("此图片正在被内容引用，请先从内容或图库中移除。");
        throw new Error(body.error?.message ?? "无法删除媒体。");
      }
      card.remove();
    } catch (caught) {
      remove.disabled = false;
      error.setAttribute("role", "alert");
      error.textContent = caught instanceof Error ? caught.message : "无法删除媒体。";
    }
  }
}

function input(name: string, type: string): HTMLInputElement {
  const element = document.createElement("input");
  element.name = name;
  element.type = type;
  return element;
}

function label(text: string, control: HTMLInputElement): HTMLLabelElement {
  const element = document.createElement("label");
  const caption = document.createElement("span");
  caption.textContent = text;
  element.appendChild(caption);
  element.appendChild(control);
  return element;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}
