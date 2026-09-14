export type DataTableColumn<T> = {
  key: string;
  label: string;
  getValue: (row: T) => string | number;
  render?: (cell: HTMLTableCellElement, row: T) => void;
};

export type DataTableFilter<T> = {
  label: string;
  matches: (row: T) => boolean;
};

export type DataTableState<T> =
  | { status: "loading" }
  | { status: "error"; message: string; retry?: () => void }
  | { status: "data"; rows: readonly T[] };

export type DataTableOptions<T> = {
  ariaLabel: string;
  columns: readonly DataTableColumn<T>[];
  state: DataTableState<T>;
  searchLabel?: string;
  filters?: readonly DataTableFilter<T>[];
  pageSize?: number;
  emptyMessage?: string;
};

export type DataTableController<T> = {
  setState: (state: DataTableState<T>) => void;
};

/** A DOM-safe, framework-free data table with a single async-state contract. */
export function mountDataTable<T>(container: HTMLElement, options: DataTableOptions<T>): DataTableController<T> {
  const pageSize = options.pageSize ?? 10;
  const filters = options.filters ?? [];
  let state = options.state;
  let query = "";
  let activeFilter = 0;
  let page = 1;
  let composing = false;

  const toolbar = document.createElement("div");
  toolbar.className = "data-table__toolbar";
  const searchLabel = document.createElement("label");
  searchLabel.className = "data-table__search";
  const searchText = document.createElement("span");
  searchText.textContent = options.searchLabel ?? "搜索";
  const search = document.createElement("input");
  search.type = "search";
  search.autocomplete = "off";
  search.setAttribute("data-table-search", "");
  searchLabel.appendChild(searchText);
  searchLabel.appendChild(search);
  toolbar.appendChild(searchLabel);

  const filterGroup = document.createElement("div");
  filterGroup.className = "data-table__filters";
  filterGroup.setAttribute("aria-label", "筛选");
  const filterButtons = filters.map((filter, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "data-table__filter";
    button.textContent = filter.label;
    button.dataset.tableFilter = String(index);
    button.addEventListener("click", () => {
      activeFilter = index;
      page = 1;
      render();
    });
    filterGroup.appendChild(button);
    return button;
  });
  if (filters.length > 0) toolbar.appendChild(filterGroup);

  const content = document.createElement("div");
  const pagination = document.createElement("div");
  pagination.className = "data-table__pagination";
  pagination.setAttribute("aria-live", "polite");
  const summary = document.createElement("span");
  const controls = document.createElement("span");
  const previous = paginationButton("上一页", "previous");
  const next = paginationButton("下一页", "next");
  controls.appendChild(previous);
  controls.appendChild(next);
  pagination.appendChild(summary);
  pagination.appendChild(controls);
  container.replaceChildren(toolbar, content, pagination);

  search.addEventListener("compositionstart", () => { composing = true; });
  search.addEventListener("compositionend", () => {
    composing = false;
    updateQuery(search.value);
  });
  search.addEventListener("input", () => {
    if (!composing) updateQuery(search.value);
  });
  previous.addEventListener("click", () => { page -= 1; render(); });
  next.addEventListener("click", () => { page += 1; render(); });

  function updateQuery(value: string): void {
    query = value;
    page = 1;
    render();
  }

  function render(): void {
    filterButtons.forEach((button, index) => {
      const active = index === activeFilter;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    });

    if (state.status === "loading") {
      content.replaceChildren(message("data-table__loading", "正在加载数据…", "status"));
      setPagination(0, 0, 1);
      return;
    }
    if (state.status === "error") {
      const error = document.createElement("div");
      error.className = "data-table__error";
      error.setAttribute("role", "alert");
      error.appendChild(message("", state.message));
      if (state.retry) {
        const retry = document.createElement("button");
        retry.type = "button";
        retry.textContent = "重试";
        retry.addEventListener("click", state.retry);
        error.appendChild(retry);
      }
      content.replaceChildren(error);
      setPagination(0, 0, 1);
      return;
    }

    const matching = state.rows.filter((row) => {
      const searchable = options.columns.map((column) => String(column.getValue(row))).join(" ").toLocaleLowerCase();
      return searchable.includes(query.toLocaleLowerCase()) && (!filters[activeFilter] || filters[activeFilter].matches(row));
    });
    const pageCount = Math.max(1, Math.ceil(matching.length / pageSize));
    page = Math.min(Math.max(page, 1), pageCount);
    const visible = matching.slice((page - 1) * pageSize, page * pageSize);

    if (visible.length === 0) {
      content.replaceChildren(message("data-table__empty", options.emptyMessage ?? "没有符合条件的记录。", "status"));
    } else {
      const scroll = document.createElement("div");
      scroll.className = "data-table__scroll";
      const table = document.createElement("table");
      table.setAttribute("aria-label", options.ariaLabel);
      const head = document.createElement("thead");
      const headRow = document.createElement("tr");
      options.columns.forEach((column) => {
        const cell = document.createElement("th");
        cell.scope = "col";
        cell.textContent = column.label;
        headRow.appendChild(cell);
      });
      head.appendChild(headRow);
      const body = document.createElement("tbody");
      visible.forEach((row) => {
        const rowElement = document.createElement("tr");
        options.columns.forEach((column) => {
          const cell = document.createElement("td");
          if (column.render) column.render(cell, row);
          else cell.textContent = String(column.getValue(row));
          rowElement.appendChild(cell);
        });
        body.appendChild(rowElement);
      });
      table.appendChild(head);
      table.appendChild(body);
      scroll.appendChild(table);
      content.replaceChildren(scroll);
    }
    setPagination(matching.length, visible.length, pageCount);
  }

  function setPagination(total: number, visibleCount: number, pageCount: number): void {
    const first = total === 0 ? 0 : (page - 1) * pageSize + 1;
    summary.textContent = `显示 ${first}–${Math.min(first + visibleCount - 1, total)}，共 ${total} 条`;
    previous.disabled = page <= 1 || total === 0;
    next.disabled = page >= pageCount || total === 0;
  }

  render();
  return { setState(nextState) { state = nextState; page = 1; render(); } };
}

function paginationButton(label: string, direction: "previous" | "next"): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.dataset.tablePage = direction;
  return button;
}

function message(className: string, value: string, role?: "status"): HTMLParagraphElement {
  const element = document.createElement("p");
  element.className = className;
  element.textContent = value;
  if (role) element.setAttribute("role", role);
  return element;
}
