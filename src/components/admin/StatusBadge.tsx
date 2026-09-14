export type InquiryStatus = "new" | "contacted" | "qualified" | "closed" | "spam";

const labels: Record<InquiryStatus, string> = {
  new: "新询盘",
  contacted: "已联系",
  qualified: "已确认",
  closed: "已关闭",
  spam: "垃圾信息",
};

export function appendStatusBadge(container: HTMLElement, status: InquiryStatus): void {
  const badge = document.createElement("span");
  badge.className = `status-badge status-badge--${status}`;
  badge.textContent = labels[status];
  container.appendChild(badge);
}
