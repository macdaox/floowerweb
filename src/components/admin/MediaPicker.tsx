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
  const searchForm = document.createElement("form");
  searchForm.className = "media-picker__search";
  const search = document.createElement("input");
  search.type = "search";
  search.setAttribute("aria-label", "搜索媒体选择器");
  search.placeholder = "搜索文件名或替代文本";
  const searchButton = document.createElement("button");
  searchButton.type = "submit";
  searchButton.className = "admin-secondary-button";
  searchButton.textContent = "搜索";
  searchForm.appendChild(search);
  searchForm.appendChild(searchButton);
  const grid = document.createElement("div");
  grid.className = "media-picker__grid";
  const loadMore = document.createElement("button");
  loadMore.type = "button";
  loadMore.className = "admin-secondary-button media-picker__more";
  loadMore.textContent = "加载更多媒体";
  dialog.appendChild(header);
  dialog.appendChild(searchForm);
  dialog.appendChild(status);
  dialog.appendChild(grid);
  dialog.appendChild(loadMore);
  document.body.appendChild(dialog);

  return new Promise((resolve) => {
    let resolved = false;
    let page = 0;
    let totalPages = 1;
    let total = 0;
    let loading = false;
    const finish = (item: MediaItem | null) => {
      if (resolved) return;
      resolved = true;
      dialog.close();
      dialog.remove();
      resolve(item);
    };
    close.addEventListener("click", () => finish(null));
    dialog.addEventListener("cancel", (event) => { event.preventDefault(); finish(null); });
    searchForm.addEventListener("submit", (event) => { event.preventDefault(); void load(true); });
    loadMore.addEventListener("click", () => void load(false));
    dialog.showModal();
    void load(true);

    async function load(reset: boolean): Promise<void> {
      if (loading || (!reset && page >= totalPages)) return;
      loading = true;
      searchButton.disabled = true;
      loadMore.disabled = true;
      if (reset) {
        page = 0;
        totalPages = 1;
        total = 0;
        grid.replaceChildren();
      }
      status.removeAttribute("role");
      status.textContent = "正在加载媒体…";
      try {
        const requestedPage = page + 1;
        const query = new URLSearchParams({ page: String(requestedPage), pageSize: "24" });
        if (search.value.trim()) query.set("q", search.value.trim());
        const response = await fetch(`/api/admin/media?${query}`);
        const body = await response.json() as { ok: boolean; data?: { items: MediaItem[]; total: number; page: number; totalPages: number }; error?: { message?: string } };
        if (!response.ok || !body.ok || !body.data) throw new Error(body.error?.message ?? "无法加载媒体。");
        page = body.data.page;
        totalPages = body.data.totalPages;
        total = body.data.total;
        const items = body.data.items.filter((item) => !options.excludeIds?.has(item.id));
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
        const loaded = Math.min(page * 24, total);
        status.textContent = total ? `已显示 ${loaded} / ${total} 张图片` : "暂无可选媒体。";
      } catch (error) {
        status.setAttribute("role", "alert");
        status.textContent = error instanceof Error ? error.message : "无法加载媒体。";
      } finally {
        loading = false;
        searchButton.disabled = false;
        loadMore.disabled = page >= totalPages;
        loadMore.hidden = total === 0 || page >= totalPages;
      }
    }
  });
}
