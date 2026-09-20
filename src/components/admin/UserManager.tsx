type User = { id: string; email: string; username: string; displayName: string; role: "admin" | "editor" | "sales"; isActive: boolean; lastLoginAt: string | null; updatedAt: string };

export function initializeUserManager(root: HTMLElement): void {
  if (root.dataset.initialized) return;
  root.dataset.initialized = "true";
  const feedback = document.createElement("p"); feedback.dataset.userFeedback = ""; feedback.setAttribute("aria-live", "polite");
  const content = document.createElement("div");
  const createForm = userCreateForm(async (data, submit) => {
    submit.disabled = true; feedback.textContent = "正在创建用户…";
    try {
      const response = await fetch("/api/admin/users/new", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ version: 1, action: "create", ...data }) });
      const body = await response.json() as { ok: boolean; error?: { message?: string; fields?: Record<string, string> } };
      if (!response.ok || !body.ok) throw new Error(body.error?.fields?.password ?? body.error?.message ?? "无法创建用户。");
      createForm.reset(); await load(); feedback.textContent = "用户已创建。";
    } catch (error) { feedback.setAttribute("role", "alert"); feedback.textContent = error instanceof Error ? error.message : "无法创建用户。"; }
    finally { submit.disabled = false; }
  });
  root.replaceChildren(createForm, feedback, content); void load();

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

function userCreateForm(onSubmit: (data: Record<string, string>, submit: HTMLButtonElement) => Promise<void>): HTMLFormElement {
  const form = document.createElement("form"); form.className = "content-editor__form"; form.setAttribute("aria-label", "创建用户");
  const fields = document.createElement("div"); fields.className = "content-editor__fields";
  const controls = new Map<string, HTMLInputElement | HTMLSelectElement>();
  for (const [name, labelText, type] of [["email", "邮箱", "email"], ["username", "用户名", "text"], ["displayName", "显示名称", "text"], ["password", "初始密码", "password"]] as const) {
    const label = document.createElement("label"); label.textContent = labelText;
    const input = document.createElement("input"); input.name = name; input.type = type; input.required = true; input.id = `new-user-${name}`; label.htmlFor = input.id;
    if (name === "password") { input.minLength = 15; input.autocomplete = "new-password"; }
    const group = document.createElement("div"); group.className = "content-editor__field"; group.appendChild(label); group.appendChild(input); fields.appendChild(group); controls.set(name, input);
  }
  const roleLabel = document.createElement("label"); roleLabel.textContent = "角色";
  const role = select("新用户角色", [["editor", "内容编辑"], ["sales", "销售"], ["admin", "管理员"]]); role.name = "role"; role.id = "new-user-role"; roleLabel.htmlFor = role.id;
  const roleGroup = document.createElement("div"); roleGroup.className = "content-editor__field"; roleGroup.appendChild(roleLabel); roleGroup.appendChild(role); fields.appendChild(roleGroup); controls.set("role", role);
  const submit = button("创建用户", "admin-primary-button"); submit.type = "submit";
  const help = document.createElement("p"); help.textContent = "密码需包含至少 15 个非空白字符。";
  form.appendChild(fields); form.appendChild(help); form.appendChild(submit);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    void onSubmit(Object.fromEntries(Array.from(controls, ([name, control]) => [name, control.value])), submit);
  });
  return form;
}

function select(label: string, options: string[][]) { const element = document.createElement("select"); element.setAttribute("aria-label", label); for (const [value, text] of options) element.appendChild(new Option(text, value)); return element; }
function button(label: string, className: string) { const element = document.createElement("button"); element.type = "button"; element.className = className; element.textContent = label; return element; }
function formatDate(value: string) { const date = new Date(value); return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(date); }
