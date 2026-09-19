type Subscriber = { id: string; email: string; source: string; status: string; subscribedAt: string; unsubscribedAt: string | null };

export function initializeSubscriberList(root: HTMLElement): void {
  if (root.dataset.initialized) return;
  root.dataset.initialized = "true";
  let page = 1;
  let totalPages = 1;
  const status = select("订阅状态", [["", "全部状态"], ["subscribed", "已订阅"], ["unsubscribed", "已退订"]]);
  const source = input("来源筛选");
  const from = input("开始日期", "date");
  const to = input("结束日期", "date");
  const search = input("搜索");
  const exportLink = document.createElement("a");
  exportLink.textContent = "导出 CSV";
  exportLink.className = "admin-primary-button";
  exportLink.href = "/api/admin/subscribers/export";
  const toolbar = document.createElement("div"); toolbar.className = "content-list__toolbar"; for (const control of [status, source, from, to, search, exportLink]) toolbar.appendChild(control);
  const feedback = document.createElement("p"); feedback.className = "content-list__feedback"; feedback.setAttribute("aria-live", "polite");
  const content = document.createElement("div");
  const previous = button("上一页");
  const next = button("下一页");
  const pageSummary = document.createElement("span"); pageSummary.setAttribute("aria-live", "polite");
  const pagination = document.createElement("nav"); pagination.className = "data-table__pagination"; pagination.setAttribute("aria-label", "订阅者分页");
  const paginationActions = document.createElement("span"); paginationActions.appendChild(previous); paginationActions.appendChild(next);
  pagination.appendChild(pageSummary); pagination.appendChild(paginationActions);
  root.replaceChildren(toolbar, feedback, content, pagination);
  for (const control of [status, from, to]) control.addEventListener("change", resetAndLoad);
  for (const control of [source, search]) control.addEventListener("input", debounce(resetAndLoad));
  previous.addEventListener("click", () => { if (page > 1) { page -= 1; void load(); } });
  next.addEventListener("click", () => { if (page < totalPages) { page += 1; void load(); } });
  void load();

  function query(): URLSearchParams {
    const result = new URLSearchParams();
    for (const [key, value] of [["status", status.value], ["source", source.value.trim()], ["dateFrom", from.value], ["dateTo", to.value], ["q", search.value.trim()]]) if (value) result.set(key, value);
    return result;
  }

  async function load(): Promise<void> {
    const params = query();
    exportLink.href = `/api/admin/subscribers/export${params.size ? `?${params}` : ""}`;
    params.set("page", String(page));
    params.set("pageSize", "50");
    feedback.textContent = "正在加载…";
    try {
      const response = await fetch(`/api/admin/subscribers${params.size ? `?${params}` : ""}`);
      const body = await response.json() as { ok: boolean; data?: { items: Subscriber[]; page: number; totalPages: number; total: number }; error?: { message?: string } };
      if (!response.ok || !body.ok || !body.data) throw new Error(body.error?.message ?? "无法加载订阅者。");
      page = body.data.page;
      totalPages = body.data.totalPages;
      pageSummary.textContent = `第 ${page} / ${totalPages} 页`;
      previous.disabled = page <= 1;
      next.disabled = page >= totalPages;
      feedback.textContent = `共 ${body.data.total} 位订阅者`;
      render(body.data.items);
    } catch (error) { content.replaceChildren(); feedback.setAttribute("role", "alert"); feedback.textContent = error instanceof Error ? error.message : "无法加载订阅者。"; }
  }

  function resetAndLoad(): void { page = 1; void load(); }

  function render(items: Subscriber[]): void {
    if (!items.length) { content.replaceChildren(document.createTextNode("暂无订阅者。")); return; }
    const table = document.createElement("table"); table.setAttribute("aria-label", "订阅者列表");
    const head = table.createTHead().insertRow();
    for (const label of ["邮箱", "来源", "状态", "订阅时间", "退订时间"]) { const th = document.createElement("th"); th.scope = "col"; th.textContent = label; head.appendChild(th); }
    const body = table.createTBody();
    for (const item of items) { const row = body.insertRow(); for (const value of [item.email, item.source, item.status === "subscribed" ? "已订阅" : "已退订", formatDate(item.subscribedAt), item.unsubscribedAt ? formatDate(item.unsubscribedAt) : "—"]) row.insertCell().textContent = value; }
    const scroll = document.createElement("div"); scroll.className = "data-table__scroll"; scroll.appendChild(table); content.replaceChildren(scroll);
  }
}

function select(label: string, options: string[][]) { const element = document.createElement("select"); element.setAttribute("aria-label", label); for (const [value, text] of options) element.appendChild(new Option(text, value)); return element; }
function input(label: string, type = "search") { const element = document.createElement("input"); element.type = type; element.setAttribute("aria-label", label); return element; }
function button(label: string) { const element = document.createElement("button"); element.type = "button"; element.textContent = label; return element; }
function formatDate(value: string) { const date = new Date(value); return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(date); }
function debounce(action: () => void) { let timer = 0; return () => { window.clearTimeout(timer); timer = window.setTimeout(action, 250); }; }
