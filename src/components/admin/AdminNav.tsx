import type { Role } from "../../lib/db/types";

export type AdminNavItem = {
  href: string;
  label: string;
  roles: readonly Role[];
};

const navigation: readonly AdminNavItem[] = [
  { href: "/admin", label: "仪表盘", roles: ["admin", "editor", "sales"] },
  { href: "/admin/inquiries", label: "询盘", roles: ["admin", "sales"] },
  { href: "/admin/subscribers", label: "订阅者", roles: ["admin", "sales"] },
  { href: "/admin/products", label: "产品与分类", roles: ["admin", "editor"] },
  { href: "/admin/spaces", label: "案例空间", roles: ["admin", "editor"] },
  { href: "/admin/journal", label: "期刊内容", roles: ["admin", "editor"] },
  { href: "/admin/pages", label: "页面", roles: ["admin", "editor"] },
  { href: "/admin/media", label: "媒体库", roles: ["admin", "editor"] },
  { href: "/admin/users", label: "用户", roles: ["admin"] },
  { href: "/admin/settings", label: "设置", roles: ["admin"] },
];

export function adminNavigation(role: Role): AdminNavItem[] {
  return navigation.filter((item) => item.roles.includes(role));
}
