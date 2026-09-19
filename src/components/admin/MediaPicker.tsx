export type MediaItem = {
  id: string;
  objectKey: string;
  originalFilename: string;
  mimeType: string;
  byteSize: number;
  altText: string | null;
  url: string;
};

export async function openMediaPicker(options: { excludeIds?: Set<string> } = {}): Promise<MediaItem | null> {
  const dialog = document.createElement("dialog");
  dialog.className = "media-picker";
  dialog.setAttribute("aria-label", "选择媒体");
  const heading = document.createElement("h2");
  heading.textContent = "选择媒体";
  const close = document.createElement("button");
  close.type = "button";
  close.className = "admin-secondary-button";
  close.textContent = "取消";
  const header = document.createElement("header");
  header.appendChild(heading);
  header.appendChild(close);
  const status = document.createElement("p");
  status.textContent = "正在加载媒体…";
  status.setAttribute("aria-live", "polite");
  const grid = document.createElement("div");
  grid.className = "media-picker__grid";
  dialog.appendChild(header);
  dialog.appendChild(status);
  dialog.appendChild(grid);
  document.body.appendChild(dialog);

  return new Promise((resolve) => {
    let resolved = false;
    const finish = (item: MediaItem | null) => {
      if (resolved) return;
      resolved = true;
      dialog.close();
      dialog.remove();
      resolve(item);
    };
    close.addEventListener("click", () => finish(null));
    dialog.addEventListener("cancel", (event) => { event.preventDefault(); finish(null); });
    dialog.showModal();
    void load();

    async function load(): Promise<void> {
      try {
        const response = await fetch("/api/admin/media?pageSize=100");
        const body = await response.json() as { ok: boolean; data?: { items: MediaItem[] }; error?: { message?: string } };
        if (!response.ok || !body.ok || !body.data) throw new Error(body.error?.message ?? "无法加载媒体。");
        const items = body.data.items.filter((item) => !options.excludeIds?.has(item.id));
        status.textContent = items.length ? "" : "暂无可选媒体。";
        for (const item of items) {
          const choose = document.createElement("button");
          choose.type = "button";
          choose.setAttribute("aria-label", `选择 ${item.originalFilename}`);
          const image = document.createElement("img");
          image.src = item.url;
          image.alt = item.altText || "";
          image.loading = "lazy";
          const name = document.createElement("span");
          name.textContent = item.originalFilename;
          choose.appendChild(image);
          choose.appendChild(name);
          choose.addEventListener("click", () => finish(item));
          grid.appendChild(choose);
        }
      } catch (error) {
        status.setAttribute("role", "alert");
        status.textContent = error instanceof Error ? error.message : "无法加载媒体。";
      }
    }
  });
}
