import { initializeContentEditor, loadAllContentRecords, type ContentEditorController, type ContentEntity, type ContentRecord } from "./editor";

type ListResponse = {
  items: ContentRecord[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

const labels: Record<ContentEntity, { create: string; empty: string }> = {
  products: { create: "新建产品", empty: "暂无产品。" },
  categories: { create: "新建分类", empty: "暂无分类。" },
  spaces: { create: "新建案例", empty: "暂无案例。" },
  articles: { create: "新建文章", empty: "暂无文章。" },
  pages: { create: "新建页面", empty: "暂无页面。" },
};

export function initializeContentList(root: HTMLElement): void {
  if (root.dataset.initialized) return;
  root.dataset.initialized = "true";
  const entity = (root.dataset.contentEntity as ContentEntity | undefined) ?? "products";
  let page = 1;
  let totalPages = 1;
  let timer: number | undefined;
  let editorController: ContentEditorController | undefined;

  const create = document.createElement("button");
  create.type = "button";
  create.className = "admin-primary-button";
  create.textContent = labels[entity].create;
  const searchLabel = document.createElement("label");
  searchLabel.textContent = "搜索";
  const search = document.createElement("input");
  search.type = "search";
  search.autocomplete = "off";
  searchLabel.appendChild(search);
  const status = select("状态筛选", [["", "全部状态"], ["draft", "草稿"], ["published", "已发布"], ["archived", "已归档"]]);
  const order = select("排序", [["updatedAt", "最近更新"], ["name", "名称"], ["status", "状态"]]);
  const direction = select("排序方向", [["desc", "降序"], ["asc", "升序"]]);
  const category = document.createElement("select");
  category.setAttribute("aria-label", "分类筛选");
  const allCategories = document.createElement("option");
  allCategories.value = "";
  allCategories.textContent = "全部分类";
  category.appendChild(allCategories);
  const toolbar = document.createElement("div");
  toolbar.className = "content-list__toolbar";
  toolbar.appendChild(searchLabel);
  toolbar.appendChild(status);
  if (entity === "products" || entity === "spaces") toolbar.appendChild(category);
  toolbar.appendChild(order);
  toolbar.appendChild(direction);
  toolbar.appendChild(create);

  const feedback = document.createElement("p");
  feedback.className = "content-list__feedback";
  feedback.setAttribute("aria-live", "polite");
  const content = document.createElement("div");
  const previous = document.createElement("button");
  previous.type = "button";
  previous.textContent = "上一页";
  const next = document.createElement("button");
  next.type = "button";
  next.textContent = "下一页";
  const paginationSummary = document.createElement("span");
  const pagination = document.createElement("div");
  pagination.className = "data-table__pagination";
  pagination.appendChild(paginationSummary);
  const paginationActions = document.createElement("span");
  paginationActions.appendChild(previous);
  paginationActions.appendChild(next);
  pagination.appendChild(paginationActions);
  const editor = document.createElement("aside");
  editor.className = "content-editor";
  editor.hidden = true;
  editor.setAttribute("aria-label", "内容编辑器");
  root.replaceChildren(toolbar, feedback, content, pagination, editor);

  create.addEventListener("click", () => openEditor());
  search.addEventListener("input", () => { window.clearTimeout(timer); timer = window.setTimeout(() => { page = 1; void load(); }, 200); });
  for (const control of [status, order, direction, category]) control.addEventListener("change", () => { page = 1; void load(); });
  previous.addEventListener("click", () => { if (page > 1) { page -= 1; void load(); } });
  next.addEventListener("click", () => { if (page < totalPages) { page += 1; void load(); } });

  if (entity === "products") void loadProductCategories();
  if (entity === "spaces") void loadSpaceCategories();
  void load();

  async function load(): Promise<void> {
    feedback.removeAttribute("role");
    feedback.textContent = "正在加载数据…";
    const query = new URLSearchParams({ page: String(page), pageSize: "20", order: order.value, direction: direction.value });
    if (search.value.trim()) query.set("q", search.value.trim());
    if (status.value) query.set("status", status.value);
    if (category.value) query.set("category", category.value);
    try {
      const response = await fetch(`/api/admin/${entity}?${query}`);
      const body = await response.json() as { ok: boolean; data?: ListResponse; error?: { message?: string } };
      if (!response.ok || !body.ok || !body.data) throw new Error(body.error?.message ?? "无法加载内容。");
      feedback.textContent = "";
      page = body.data.page;
      totalPages = body.data.totalPages;
      render(body.data);
    } catch (error) {
      content.replaceChildren();
      feedback.setAttribute("role", "alert");
      feedback.textContent = error instanceof Error ? error.message : "无法加载内容。";
    }
  }

  function render(data: ListResponse): void {
    paginationSummary.textContent = `第 ${data.page} / ${data.totalPages} 页，共 ${data.total} 条`;
    previous.disabled = data.page <= 1;
    next.disabled = data.page >= data.totalPages;
    if (!data.items.length) {
      const empty = document.createElement("p");
      empty.className = "data-table__empty";
      empty.textContent = labels[entity].empty;
      content.replaceChildren(empty);
      return;
    }
    const scroll = document.createElement("div");
    scroll.className = "data-table__scroll";
    const table = document.createElement("table");
    table.setAttribute("aria-label", "内容列表");
    const head = document.createElement("thead");
    const headingRow = document.createElement("tr");
    for (const label of ["名称", "状态", "更新时间", "操作"]) {
      const cell = document.createElement("th");
      cell.scope = "col";
      cell.textContent = label;
      headingRow.appendChild(cell);
    }
    head.appendChild(headingRow);
    table.appendChild(head);
    const body = document.createElement("tbody");
    for (const row of data.items) {
      const tableRow = document.createElement("tr");
      tableRow.appendChild(cell(String(row.name ?? row.title ?? row.pageKey ?? "—")));
      tableRow.appendChild(cell(statusLabel(String(row.status ?? ""))));
      tableRow.appendChild(cell(formatDate(row.updatedAt)));
      const actionCell = document.createElement("td");
      const edit = document.createElement("button");
      edit.type = "button";
      edit.className = "admin-link-button";
      edit.textContent = "编辑";
      edit.addEventListener("click", () => openEditor(row));
      actionCell.appendChild(edit);
      tableRow.appendChild(actionCell);
      body.appendChild(tableRow);
    }
    table.appendChild(body);
    scroll.appendChild(table);
    content.replaceChildren(scroll);
  }

  function openEditor(record?: ContentRecord): void {
    if (editorController && !editorController.requestClose()) return;
    editorController = undefined;
    editor.hidden = false;
    editorController = initializeContentEditor(editor, {
      entity,
      record,
      onSaved: () => void load(),
      onClosed: () => { editorController = undefined; editor.hidden = true; editor.replaceChildren(); },
    });
    editor.querySelector<HTMLInputElement>("input, textarea, select")?.focus();
  }

  async function loadProductCategories(): Promise<void> {
    try {
      for (const item of await loadAllContentRecords("categories")) {
        const option = document.createElement("option");
        option.value = String(item.id);
        option.textContent = String(item.name ?? item.id);
        category.appendChild(option);
      }
    } catch {
      // The unfiltered list remains usable when category options fail.
    }
  }

  async function loadSpaceCategories(): Promise<void> {
    try {
      const values = [...new Set((await loadAllContentRecords("spaces")).map((item) => String(item.category ?? "")).filter(Boolean))];
      for (const value of values) {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = value;
        category.appendChild(option);
      }
    } catch {
      // The unfiltered list remains usable when category options fail.
    }
  }
}

function select(label: string, options: string[][]): HTMLSelectElement {
  const element = document.createElement("select");
  element.setAttribute("aria-label", label);
  for (const [value, text] of options) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = text;
    element.appendChild(option);
  }
  return element;
}

function cell(value: string): HTMLTableCellElement {
  const element = document.createElement("td");
  element.textContent = value;
  return element;
}

function statusLabel(value: string): string {
  return value === "draft" ? "草稿" : value === "published" ? "已发布" : value === "archived" ? "已归档" : value;
}

function formatDate(value: unknown): string {
  const date = new Date(String(value ?? ""));
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(date);
}
