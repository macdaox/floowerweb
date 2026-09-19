type Settings = Record<string, string | null> & { updatedAt: string };
const fields = [
  ["companyName", "公司名称", "input"], ["tagline", "品牌标语", "input"], ["companyDescription", "公司简介", "textarea"], ["contactEmail", "联系邮箱", "email"],
  ["instagramUrl", "Instagram URL", "url"], ["pinterestUrl", "Pinterest URL", "url"], ["linkedinUrl", "LinkedIn URL", "url"],
  ["defaultSeoTitle", "默认 SEO 标题", "input"], ["defaultSeoDescription", "默认 SEO 描述", "textarea"],
] as const;

export function initializeSettingsEditor(root: HTMLElement): void {
  if (root.dataset.initialized) return;
  root.dataset.initialized = "true";
  const feedback = document.createElement("p"); feedback.dataset.settingsFeedback = ""; feedback.setAttribute("aria-live", "polite");
  root.replaceChildren(feedback); void load();

  async function load(): Promise<void> {
    feedback.textContent = "正在加载…";
    try {
      const response = await fetch("/api/admin/settings");
      const body = await response.json() as { ok: boolean; data?: Settings; error?: { message?: string } };
      if (!response.ok || !body.ok || !body.data) throw new Error(body.error?.message ?? "无法加载设置。");
      render(body.data);
    } catch (error) { feedback.setAttribute("role", "alert"); feedback.textContent = error instanceof Error ? error.message : "无法加载设置。"; }
  }

  function render(settings: Settings): void {
    const form = document.createElement("form"); form.className = "content-editor__form";
    const fieldset = document.createElement("div"); fieldset.className = "content-editor__fields";
    const controls = new Map<string, HTMLInputElement | HTMLTextAreaElement>();
    for (const [name, labelText, kind] of fields) {
      const group = document.createElement("div"); group.className = kind === "textarea" ? "content-editor__field content-editor__field--wide" : "content-editor__field";
      const label = document.createElement("label"); label.textContent = labelText; label.htmlFor = `settings-${name}`;
      const control = kind === "textarea" ? document.createElement("textarea") : document.createElement("input");
      if (control instanceof HTMLInputElement) control.type = kind === "email" || kind === "url" ? kind : "text";
      else control.rows = 4;
      control.id = `settings-${name}`; control.name = name; control.value = settings[name] ?? ""; if (name === "companyName") control.required = true;
      group.appendChild(label); group.appendChild(control); fieldset.appendChild(group); controls.set(name, control);
    }
    const save = document.createElement("button"); save.type = "submit"; save.className = "admin-primary-button"; save.textContent = "保存设置";
    form.appendChild(fieldset); form.appendChild(save); root.replaceChildren(form, feedback); feedback.textContent = "";
    form.addEventListener("submit", async (event) => {
      event.preventDefault(); save.disabled = true; feedback.textContent = "正在保存…";
      try {
        const data = Object.fromEntries(Array.from(controls, ([name, control]) => [name, control.value]));
        const response = await fetch("/api/admin/settings", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ version: 1, updatedAt: settings.updatedAt, data }) });
        const body = await response.json() as { ok: boolean; data?: Settings; error?: { message?: string } };
        if (!response.ok || !body.ok || !body.data) throw new Error(body.error?.message ?? "无法保存设置。");
        render(body.data); feedback.textContent = "已保存。";
      } catch (error) { feedback.setAttribute("role", "alert"); feedback.textContent = error instanceof Error ? error.message : "无法保存设置。"; save.disabled = false; }
    });
  }
}
