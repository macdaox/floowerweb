type User = { id: string; email: string; username: string; displayName: string; role: "admin" | "editor" | "sales"; isActive: boolean; lastLoginAt: string | null; updatedAt: string };

export function initializeUserManager(root: HTMLElement): void {
  if (root.dataset.initialized) return;
  root.dataset.initialized = "true";
  const feedback = document.createElement("p"); feedback.dataset.userFeedback = ""; feedback.setAttribute("aria-live", "polite");
  const content = document.createElement("div"); root.replaceChildren(feedback, content); void load();

  async function load(): Promise<void> {
    feedback.textContent = "正在加载…";
    try {
      const response = await fetch("/api/admin/users/list");
      const body = await response.json() as { ok: boolean; data?: { items: User[] }; error?: { message?: string } };
      if (!response.ok || !body.ok || !body.data) throw new Error(body.error?.message ?? "无法加载用户。");
      render(body.data.items); feedback.textContent = "";
    } catch (error) { feedback.setAttribute("role", "alert"); feedback.textContent = error instanceof Error ? error.message : "无法加载用户。"; }
  }

  function render(users: User[]): void {
    const table = document.createElement("table"); table.setAttribute("aria-label", "用户列表");
    const head = table.createTHead().insertRow();
    for (const label of ["用户", "角色", "启用", "最后登录", "操作"]) { const th = document.createElement("th"); th.scope = "col"; th.textContent = label; head.appendChild(th); }
    const body = table.createTBody();
    for (const user of users) {
      const row = body.insertRow(); row.insertCell().textContent = `${user.displayName}\n${user.email}`;
      const roleCell = row.insertCell(); const role = select("角色", [["admin", "管理员"], ["editor", "内容编辑"], ["sales", "销售"]]); role.value = user.role; roleCell.appendChild(role);
      const activeCell = row.insertCell(); const active = document.createElement("input"); active.type = "checkbox"; active.checked = user.isActive; active.setAttribute("aria-label", "启用账户"); activeCell.appendChild(active);
      row.insertCell().textContent = user.lastLoginAt ? formatDate(user.lastLoginAt) : "从未";
      const actions = row.insertCell(); const save = button("保存用户", "admin-primary-button"); const reset = button("重置密码", "admin-secondary-button"); actions.appendChild(save); actions.appendChild(reset);
      save.addEventListener("click", () => void mutate(user, { action: "update", role: role.value, isActive: active.checked }, save));
      reset.addEventListener("click", () => {
        const password = window.prompt(`请输入 ${user.displayName} 的新密码（至少 12 位）`);
        if (password !== null) void mutate(user, { action: "resetPassword", password }, reset);
      });
    }
    const scroll = document.createElement("div"); scroll.className = "data-table__scroll"; scroll.appendChild(table); content.replaceChildren(scroll);
  }

  async function mutate(user: User, operation: Record<string, unknown>, control: HTMLButtonElement): Promise<void> {
    control.disabled = true; feedback.textContent = "正在保存…";
    try {
      const response = await fetch(`/api/admin/users/${encodeURIComponent(user.id)}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ version: 1, updatedAt: user.updatedAt, ...operation }) });
      const body = await response.json() as { ok: boolean; error?: { message?: string } };
      if (!response.ok || !body.ok) throw new Error(body.error?.message ?? "无法保存用户。");
      await load(); feedback.textContent = "已保存。";
    } catch (error) { feedback.setAttribute("role", "alert"); feedback.textContent = error instanceof Error ? error.message : "无法保存用户。"; control.disabled = false; }
  }
}

function select(label: string, options: string[][]) { const element = document.createElement("select"); element.setAttribute("aria-label", label); for (const [value, text] of options) element.appendChild(new Option(text, value)); return element; }
function button(label: string, className: string) { const element = document.createElement("button"); element.type = "button"; element.className = className; element.textContent = label; return element; }
function formatDate(value: string) { const date = new Date(value); return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(date); }
