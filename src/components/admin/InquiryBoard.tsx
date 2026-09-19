import { renderInquiryDetail } from "./InquiryDetail";

type InquirySummary = { id: string; name: string; email: string; company: string | null; country: string | null; inquiryType: string; status: string; assigneeDisplayName: string | null; productName: string | null; createdAt: string };
type Assignee = { id: string; displayName: string; role: string };
type ListData = { items: InquirySummary[]; assignees: Assignee[]; total: number };

export function initializeInquiryBoard(root: HTMLElement): void {
  if (root.dataset.initialized) return;
  root.dataset.initialized = "true";
  const type = select("询盘类型", [["", "全部类型"], ["product", "产品"], ["contact", "联系"], ["catalog", "目录"]]);
  const status = select("状态筛选", [["", "全部状态"], ["new", "新询盘"], ["contacted", "已联系"], ["qualified", "有效"], ["closed", "已关闭"], ["spam", "垃圾"]]);
  const assignee = select("负责人筛选", [["", "全部负责人"]]);
  const from = input("开始日期", "date");
  const to = input("结束日期", "date");
  const market = input("市场筛选");
  const product = input("产品筛选");
  const toolbar = document.createElement("div");
  toolbar.className = "content-list__toolbar";
  for (const control of [type, status, assignee, from, to, market, product]) toolbar.appendChild(control);
  const feedback = document.createElement("p");
  feedback.className = "content-list__feedback";
  feedback.setAttribute("aria-live", "polite");
  const list = document.createElement("div");
  const detail = document.createElement("aside");
  detail.className = "content-editor";
  detail.hidden = true;
  detail.setAttribute("aria-label", "询盘详情");
  root.replaceChildren(toolbar, feedback, list, detail);
  for (const control of [type, status, assignee, from, to, market, product]) control.addEventListener("change", () => void load());
  for (const control of [market, product]) control.addEventListener("input", debounce(() => void load()));
  void load();

  async function load(): Promise<void> {
    feedback.textContent = "正在加载…";
    const query = new URLSearchParams();
    for (const [key, value] of [["type", type.value], ["status", status.value], ["assignee", assignee.value], ["dateFrom", from.value], ["dateTo", to.value], ["market", market.value.trim()], ["product", product.value.trim()]]) if (value) query.set(key, value);
    try {
      const response = await fetch(`/api/admin/inquiries/list?${query}`);
      const body = await response.json() as { ok: boolean; data?: ListData; error?: { message?: string } };
      if (!response.ok || !body.ok || !body.data) throw new Error(body.error?.message ?? "无法加载询盘。");
      render(body.data);
      feedback.textContent = `共 ${body.data.total} 条询盘`;
    } catch (error) {
      list.replaceChildren(); feedback.setAttribute("role", "alert"); feedback.textContent = error instanceof Error ? error.message : "无法加载询盘。";
    }
  }

  function render(data: ListData): void {
    const known = new Set(Array.from(assignee.options).map((option) => option.value));
    for (const user of data.assignees) if (!known.has(user.id)) assignee.appendChild(new Option(user.displayName, user.id));
    if (!data.items.length) { list.replaceChildren(document.createTextNode("暂无询盘。")); return; }
    const table = document.createElement("table"); table.setAttribute("aria-label", "询盘列表");
    const head = table.createTHead().insertRow();
    for (const label of ["买家", "类型", "状态", "市场 / 产品", "负责人", "提交时间"]) { const th = document.createElement("th"); th.scope = "col"; th.textContent = label; head.appendChild(th); }
    const body = table.createTBody();
    for (const inquiry of data.items) {
      const row = body.insertRow();
      const buyer = row.insertCell();
      const open = document.createElement("button"); open.type = "button"; open.className = "admin-link-button"; open.textContent = `${inquiry.name} · ${inquiry.email}`;
      open.addEventListener("click", () => void renderInquiryDetail(detail, inquiry.id, data.assignees, () => void load()));
      buyer.appendChild(open); buyer.appendChild(document.createElement("br")); buyer.appendChild(document.createTextNode(inquiry.company ?? "—"));
      for (const value of [inquiry.inquiryType, inquiry.status, [inquiry.country, inquiry.productName].filter(Boolean).join(" / ") || "—", inquiry.assigneeDisplayName ?? "未分配", formatDate(inquiry.createdAt)]) row.insertCell().textContent = value;
    }
    const scroll = document.createElement("div"); scroll.className = "data-table__scroll"; scroll.appendChild(table); list.replaceChildren(scroll);
  }
}

function select(label: string, options: string[][]) { const element = document.createElement("select"); element.setAttribute("aria-label", label); for (const [value, text] of options) element.appendChild(new Option(text, value)); return element; }
function input(label: string, type = "search") { const element = document.createElement("input"); element.type = type; element.setAttribute("aria-label", label); return element; }
function formatDate(value: string) { const date = new Date(value); return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(date); }
function debounce(action: () => void) { let timer = 0; return () => { window.clearTimeout(timer); timer = window.setTimeout(action, 250); }; }
