import { openMediaPicker, type MediaItem } from "./MediaPicker";

type GalleryEntity = "product" | "space";
type GalleryItem = {
  id?: string;
  mediaId: string;
  altText: string;
  sortOrder: number;
  isCover: boolean;
  media: MediaItem;
};

export function initializeGalleryEditor(root: HTMLElement, options: { entity: GalleryEntity; contentId: string }): void {
  if (root.dataset.galleryFor === options.contentId) return;
  root.dataset.galleryFor = options.contentId;
  let items: GalleryItem[] = [];
  let saving = false;

  const heading = document.createElement("h3");
  heading.textContent = "图库";
  const help = document.createElement("p");
  help.textContent = "选择图片、填写英文替代文本，并设置顺序和封面。";
  const add = document.createElement("button");
  add.type = "button";
  add.className = "admin-secondary-button";
  add.textContent = "从媒体库添加";
  const save = document.createElement("button");
  save.type = "button";
  save.className = "admin-primary-button";
  save.textContent = "保存图库";
  const list = document.createElement("div");
  list.className = "gallery-editor__list";
  const status = document.createElement("p");
  status.dataset.galleryStatus = "";
  status.setAttribute("aria-live", "polite");
  const actions = document.createElement("div");
  actions.className = "content-editor__actions";
  actions.appendChild(add);
  actions.appendChild(save);
  root.className = "gallery-editor";
  root.replaceChildren(heading, help, list, actions, status);

  add.addEventListener("click", () => void addMedia());
  save.addEventListener("click", () => void persist());
  void load();

  async function load(): Promise<void> {
    status.textContent = "正在加载图库…";
    try {
      const query = new URLSearchParams({ entity: options.entity, contentId: options.contentId });
      const response = await fetch(`/api/admin/media?${query}`);
      const body = await response.json() as { ok: boolean; data?: { items: GalleryItem[] }; error?: { message?: string } };
      if (!response.ok || !body.ok || !body.data) throw new Error(body.error?.message ?? "无法加载图库。");
      items = body.data.items;
      status.textContent = "";
      render();
    } catch (error) {
      status.setAttribute("role", "alert");
      status.textContent = error instanceof Error ? error.message : "无法加载图库。";
    }
  }

  async function addMedia(): Promise<void> {
    const chosen = await openMediaPicker({ excludeIds: new Set(items.map((item) => item.mediaId)) });
    if (!chosen) return;
    items.push({
      mediaId: chosen.id,
      altText: chosen.altText ?? "",
      sortOrder: items.length,
      isCover: items.length === 0,
      media: chosen,
    });
    render();
  }

  function render(): void {
    list.replaceChildren();
    items.forEach((item, index) => {
      const card = document.createElement("article");
      card.className = "gallery-editor__item";
      card.dataset.galleryItem = "";
      const image = document.createElement("img");
      image.src = item.media.url;
      image.alt = "";
      const details = document.createElement("div");
      const name = document.createElement("strong");
      name.textContent = item.media.originalFilename;
      const cover = document.createElement("span");
      cover.className = "gallery-editor__cover";
      cover.textContent = item.isCover ? "封面" : "";
      const label = document.createElement("label");
      label.textContent = `图库图片 ${index + 1} 的替代文本`;
      const alt = document.createElement("input");
      alt.type = "text";
      alt.value = item.altText;
      alt.maxLength = 300;
      alt.setAttribute("aria-label", `图库图片 ${index + 1} 的替代文本`);
      alt.addEventListener("input", () => { item.altText = alt.value; });
      label.appendChild(alt);
      const controls = document.createElement("div");
      controls.className = "gallery-editor__controls";
      controls.appendChild(control(`上移图片 ${index + 1}`, "上移", index === 0, () => move(index, -1)));
      controls.appendChild(control(`下移图片 ${index + 1}`, "下移", index === items.length - 1, () => move(index, 1)));
      controls.appendChild(control(`设为封面 ${index + 1}`, "设为封面", item.isCover, () => setCover(index)));
      controls.appendChild(control(`移除图片 ${index + 1}`, "移除", false, () => remove(index)));
      details.appendChild(name);
      details.appendChild(cover);
      details.appendChild(label);
      details.appendChild(controls);
      card.appendChild(image);
      card.appendChild(details);
      list.appendChild(card);
    });
  }

  function move(index: number, direction: -1 | 1): void {
    const next = index + direction;
    if (next < 0 || next >= items.length) return;
    [items[index], items[next]] = [items[next], items[index]];
    render();
  }

  function setCover(index: number): void {
    items.forEach((item, itemIndex) => { item.isCover = itemIndex === index; });
    render();
  }

  function remove(index: number): void {
    const removedCover = items[index]?.isCover;
    items.splice(index, 1);
    if (removedCover && items.length) items[0].isCover = true;
    render();
  }

  async function persist(): Promise<void> {
    if (saving) return;
    saving = true;
    add.disabled = true;
    save.disabled = true;
    status.removeAttribute("role");
    status.textContent = "正在保存图库…";
    try {
      const response = await fetch("/api/admin/media", {
        method: "PUT",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ version: 1, entity: options.entity, contentId: options.contentId, items: items.map((item) => ({ mediaId: item.mediaId, altText: item.altText, isCover: item.isCover })) }),
      });
      const body = await response.json() as { ok: boolean; data?: { items: GalleryItem[] }; error?: { message?: string; fields?: Record<string, string> } };
      if (!response.ok || !body.ok || !body.data) throw new Error(body.error?.fields?.items ?? body.error?.message ?? "无法保存图库。");
      items = body.data.items;
      render();
      status.textContent = "图库已保存。";
    } catch (error) {
      status.setAttribute("role", "alert");
      status.textContent = error instanceof Error ? error.message : "无法保存图库。";
    } finally {
      saving = false;
      add.disabled = false;
      save.disabled = false;
    }
  }
}

function control(label: string, text: string, disabled: boolean, action: () => void): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "admin-link-button";
  button.setAttribute("aria-label", label);
  button.textContent = text;
  button.disabled = disabled;
  button.addEventListener("click", action);
  return button;
}
