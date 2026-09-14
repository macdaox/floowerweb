export type InquiryStatus = "new" | "contacted" | "qualified" | "closed" | "spam";

const labels: Record<InquiryStatus, string> = {
  new: "新询盘",
  contacted: "已联系",
  qualified: "已确认",
  closed: "已关闭",
  spam: "垃圾信息",
};

export function statusBadge(status: InquiryStatus): string {
  return `<span class="status-badge status-badge--${status}">${labels[status]}</span>`;
}
