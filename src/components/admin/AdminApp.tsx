import { mountDataTable, renderDataTableError } from "./DataTable";
import { statusBadge, type InquiryStatus } from "./StatusBadge";

type DashboardResponse = {
  metrics: { newInquiries: number; inquiriesThisWeek: number; activeSubscribers: number; publishedProducts: number };
  recentInquiries: Array<{ id: string; name: string; email: string; company: string | null; status: InquiryStatus; inquiryType: string; createdAt: string }>;
};

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
  const table = root.querySelector<HTMLElement>("[data-recent-inquiries]");
  const metricValues = root.querySelectorAll<HTMLElement>("[data-dashboard-metric]");
  try {
    const response = await fetch("/api/admin/dashboard", { headers: { accept: "application/json" } });
    const payload = await response.json() as ApiResponse;
    if (!response.ok || !payload.ok) throw new Error(!payload.ok ? payload.error?.message : "Unable to load dashboard.");

    const values = [payload.data.metrics.newInquiries, payload.data.metrics.inquiriesThisWeek, payload.data.metrics.activeSubscribers, payload.data.metrics.publishedProducts];
    metricValues.forEach((metric, index) => { metric.textContent = String(values[index] ?? 0); });
    if (!table) return;
    mountDataTable(table, {
      ariaLabel: "最近询盘",
      rows: payload.data.recentInquiries,
      columns: [
        { key: "name", label: "联系人", getValue: (inquiry) => inquiry.name },
        { key: "company", label: "公司", getValue: (inquiry) => inquiry.company ?? "—" },
        { key: "type", label: "类型", getValue: (inquiry) => inquiry.inquiryType },
        { key: "status", label: "状态", getValue: (inquiry) => inquiry.status, render: (inquiry) => statusBadge(inquiry.status) },
        { key: "created", label: "收到时间", getValue: (inquiry) => formatDate(inquiry.createdAt) },
      ],
      filters: [
        { label: "全部", matches: () => true },
        { label: "新询盘", matches: (inquiry) => inquiry.status === "new" },
      ],
      pageSize: 5,
      emptyMessage: "暂无询盘。",
    });
  } catch {
    if (table) renderDataTableError(table, "无法加载最近询盘。", () => void loadDashboard(root));
  }
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
