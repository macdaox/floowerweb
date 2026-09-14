import { mountDataTable, type DataTableController } from "./DataTable";
import { appendStatusBadge, type InquiryStatus } from "./StatusBadge";

type RecentInquiry = { id: string; name: string; email: string; company: string | null; status: InquiryStatus; inquiryType: string; createdAt: string };
type SalesDashboard = { kind: "sales"; metrics: { newInquiries: number; recentSevenDays: number; activeSubscribers: number; publishedProducts: number }; recentInquiries: RecentInquiry[] };
type ContentDashboard = { kind: "content"; metrics: { draftProducts: number; publishedProducts: number; draftSpaces: number; draftArticles: number } };
type DashboardResponse = SalesDashboard | ContentDashboard;
type ApiResponse = { ok: true; data: DashboardResponse } | { ok: false; error?: { message?: string } };

export function initializeAdminApp(): void {
  initializeMobileNavigation();
  initializeUserMenu();
  const root = document.querySelector<HTMLElement>("[data-admin-dashboard]");
  if (root && !root.dataset.initialized) {
    root.dataset.initialized = "true";
    void loadDashboard(root);
  }
}

async function loadDashboard(root: HTMLElement): Promise<void> {
  const tableElement = root.querySelector<HTMLElement>("[data-recent-inquiries]");
  const table = tableElement ? inquiryTable(tableElement) : undefined;
  clearDashboardStatus(root);
  try {
    const response = await fetch("/api/admin/dashboard", { headers: { accept: "application/json" } });
    const payload = await response.json() as ApiResponse;
    if (!response.ok || !payload.ok || payload.data.kind !== root.dataset.dashboardKind) throw new Error("Unable to load dashboard.");
    renderMetrics(root, payload.data.metrics);
    if (payload.data.kind === "sales" && table) table.setState({ status: "data", rows: payload.data.recentInquiries });
    clearDashboardStatus(root);
  } catch {
    showDashboardError(root);
  }
}

function clearDashboardStatus(root: HTMLElement): void {
  const status = root.querySelector<HTMLElement>("[data-dashboard-status]");
  const message = root.querySelector<HTMLElement>("[data-dashboard-status-message]");
  const retry = root.querySelector<HTMLButtonElement>("[data-dashboard-retry]");
  if (!status || !message || !retry) return;
  status.hidden = true;
  message.textContent = "";
  message.removeAttribute("role");
  retry.hidden = true;
  retry.onclick = null;
}

function showDashboardError(root: HTMLElement): void {
  const status = root.querySelector<HTMLElement>("[data-dashboard-status]");
  const message = root.querySelector<HTMLElement>("[data-dashboard-status-message]");
  const retry = root.querySelector<HTMLButtonElement>("[data-dashboard-retry]");
  if (!status || !message || !retry) return;
  status.hidden = false;
  message.textContent = "无法加载仪表盘数据，请重试。";
  message.setAttribute("role", "alert");
  retry.hidden = false;
  retry.onclick = () => { void loadDashboard(root); };
}

function inquiryTable(container: HTMLElement): DataTableController<RecentInquiry> {
  return mountDataTable(container, {
    ariaLabel: "最近询盘",
    state: { status: "loading" },
    columns: [
      { key: "name", label: "联系人", getValue: (inquiry) => inquiry.name },
      { key: "company", label: "公司", getValue: (inquiry) => inquiry.company ?? "—" },
      { key: "type", label: "类型", getValue: (inquiry) => inquiry.inquiryType },
      { key: "status", label: "状态", getValue: (inquiry) => inquiry.status, render: (cell, inquiry) => appendStatusBadge(cell, inquiry.status) },
      { key: "created", label: "收到时间", getValue: (inquiry) => formatDate(inquiry.createdAt) },
    ],
    filters: [
      { label: "全部", matches: () => true },
      { label: "新询盘", matches: (inquiry) => inquiry.status === "new" },
    ],
    pageSize: 5,
    emptyMessage: "暂无询盘。",
  });
}

function renderMetrics(root: HTMLElement, metrics: Record<string, number>): void {
  root.querySelectorAll<HTMLElement>("[data-dashboard-metric]").forEach((metric) => {
    metric.textContent = String(metrics[metric.dataset.dashboardMetric ?? ""] ?? 0);
  });
}

function initializeMobileNavigation(): void {
  const button = document.querySelector<HTMLButtonElement>("[data-admin-menu-button]");
  const navigation = document.querySelector<HTMLElement>("[data-admin-navigation]");
  if (!button || !navigation || button.dataset.initialized) return;
  button.dataset.initialized = "true";
  button.addEventListener("click", () => {
    const open = button.getAttribute("aria-expanded") !== "true";
    button.setAttribute("aria-expanded", String(open));
    navigation.classList.toggle("is-open", open);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") { button.setAttribute("aria-expanded", "false"); navigation.classList.remove("is-open"); }
  });
}

function initializeUserMenu(): void {
  const button = document.querySelector<HTMLButtonElement>("[data-user-menu-button]");
  const menu = document.querySelector<HTMLElement>("[data-user-menu]");
  if (!button || !menu || button.dataset.initialized) return;
  button.dataset.initialized = "true";
  button.addEventListener("click", () => {
    const open = button.getAttribute("aria-expanded") !== "true";
    button.setAttribute("aria-expanded", String(open));
    menu.hidden = !open;
  });
  document.addEventListener("click", (event) => {
    if (!(event.target as Element).closest("[data-user-menu-wrap]")) { button.setAttribute("aria-expanded", "false"); menu.hidden = true; }
  });
  menu.querySelector<HTMLButtonElement>("[data-admin-logout]")?.addEventListener("click", async () => {
    const status = document.querySelector<HTMLElement>("[data-admin-status]");
    try { await fetch("/api/auth/logout", { method: "POST", headers: { accept: "application/json" } }); } finally {
      if (status) status.textContent = "正在退出登录…";
      window.location.assign("/admin/login");
    }
  });
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? "—" : new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium" }).format(date);
}
