export type DataTableColumn<T> = {
  key: string;
  label: string;
  getValue: (row: T) => string | number;
  render?: (row: T) => string;
};

export type DataTableFilter<T> = {
  label: string;
  matches: (row: T) => boolean;
};

export type DataTableOptions<T> = {
  ariaLabel: string;
  rows: readonly T[];
  columns: readonly DataTableColumn<T>[];
  searchLabel?: string;
  filters?: readonly DataTableFilter<T>[];
  pageSize?: number;
  emptyMessage?: string;
  errorMessage?: string;
};

/**
 * A lightweight, framework-free administrative table. It owns its search,
 * filter and pagination state so it can be mounted by any Astro island.
 */
export function mountDataTable<T>(container: HTMLElement, options: DataTableOptions<T>): void {
  const pageSize = options.pageSize ?? 10;
  let query = "";
  let activeFilter = 0;
  let page = 1;

  const render = () => {
    const filters = options.filters ?? [];
    const matching = options.rows.filter((row) => {
      const searchable = options.columns.map((column) => String(column.getValue(row))).join(" ").toLocaleLowerCase();
      return searchable.includes(query.toLocaleLowerCase()) && (!filters[activeFilter] || filters[activeFilter].matches(row));
    });
    const pageCount = Math.max(1, Math.ceil(matching.length / pageSize));
    page = Math.min(page, pageCount);
    const visible = matching.slice((page - 1) * pageSize, page * pageSize);

    container.innerHTML = `
      <div class="data-table__toolbar">
        <label class="data-table__search">
          <span>${escapeHtml(options.searchLabel ?? "搜索")}</span>
          <input type="search" data-table-search value="${escapeHtml(query)}" autocomplete="off" />
        </label>
        ${filters.length > 0 ? `<div class="data-table__filters" aria-label="筛选">${filters.map((filter, index) => `<button type="button" class="data-table__filter${index === activeFilter ? " is-active" : ""}" data-table-filter="${index}" aria-pressed="${index === activeFilter}">${escapeHtml(filter.label)}</button>`).join("")}</div>` : ""}
      </div>
      ${visible.length > 0 ? `<div class="data-table__scroll"><table aria-label="${escapeHtml(options.ariaLabel)}"><thead><tr>${options.columns.map((column) => `<th scope="col">${escapeHtml(column.label)}</th>`).join("")}</tr></thead><tbody>${visible.map((row) => `<tr>${options.columns.map((column) => `<td>${column.render ? column.render(row) : escapeHtml(String(column.getValue(row)))}</td>`).join("")}</tr>`).join("")}</tbody></table></div>` : `<p class="data-table__empty" role="status">${escapeHtml(options.emptyMessage ?? "没有符合条件的记录。")}</p>`}
      <div class="data-table__pagination" aria-live="polite">
        <span>显示 ${matching.length === 0 ? 0 : (page - 1) * pageSize + 1}–${Math.min(page * pageSize, matching.length)}，共 ${matching.length} 条</span>
        <span><button type="button" data-table-page="previous" ${page === 1 ? "disabled" : ""}>上一页</button><button type="button" data-table-page="next" ${page === pageCount ? "disabled" : ""}>下一页</button></span>
      </div>`;
  };

  container.addEventListener("input", (event) => {
    const target = event.target as HTMLInputElement;
    if (!target.matches("[data-table-search]")) return;
    query = target.value;
    page = 1;
    render();
    const search = container.querySelector<HTMLInputElement>("[data-table-search]");
    search?.focus();
    search?.setSelectionRange(search.value.length, search.value.length);
  });
  container.addEventListener("click", (event) => {
    const button = (event.target as Element).closest<HTMLButtonElement>("button");
    if (!button) return;
    if (button.dataset.tableFilter !== undefined) {
      activeFilter = Number(button.dataset.tableFilter);
      page = 1;
      render();
    }
    if (button.dataset.tablePage === "previous") { page -= 1; render(); }
    if (button.dataset.tablePage === "next") { page += 1; render(); }
  });
  render();
}

export function renderDataTableError(container: HTMLElement, message = "无法加载数据，请稍后重试。", retry?: () => void): void {
  container.innerHTML = `<div class="data-table__error" role="alert"><p>${escapeHtml(message)}</p><button type="button" data-table-retry>重试</button></div>`;
  container.querySelector<HTMLButtonElement>("[data-table-retry]")?.addEventListener("click", () => retry?.());
}

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}
