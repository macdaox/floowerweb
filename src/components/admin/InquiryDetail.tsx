type Assignee = { id: string; displayName: string; role: string };
type Note = { id: string; note: string; createdAt: string; author: { id: string; displayName: string } };
type Inquiry = {
  id: string; inquiryType: string; name: string; email: string; phone: string | null; company: string | null; country: string | null;
  buyerType: string | null; message: string | null; sourceRoute: string | null; status: string; createdAt: string; updatedAt: string;
  product: { id: string; name: string; productCode: string } | null; assignee: { id: string; displayName: string } | null;
  interests: string[]; notes: Note[];
};

const transitions: Record<string, string[]> = {
  new: ["contacted", "spam"], contacted: ["qualified", "closed", "spam"], qualified: ["closed", "contacted"], closed: ["contacted"], spam: ["contacted"],
};
const statusLabels: Record<string, string> = { new: "新询盘", contacted: "已联系", qualified: "有效", closed: "已关闭", spam: "垃圾" };

export async function renderInquiryDetail(root: HTMLElement, inquiryId: string, assignees: Assignee[], onChanged: () => void): Promise<void> {
  root.hidden = false;
  root.replaceChildren(text("p", "正在加载询盘…"));
  try {
    let inquiry = await getInquiry(inquiryId);
    render();

    function render(): void {
      const title = text("h2", inquiry.name);
      const close = button("关闭询盘", "admin-secondary-button");
      const header = document.createElement("header");
      header.className = "content-editor__header";
      header.appendChild(title); header.appendChild(close);
      close.addEventListener("click", () => { root.hidden = true; root.replaceChildren(); });

      const context = document.createElement("dl");
      context.className = "operation-detail-grid";
      for (const [label, value] of [
        ["邮箱", inquiry.email], ["电话", inquiry.phone], ["公司", inquiry.company], ["市场", inquiry.country], ["买家类型", inquiry.buyerType],
        ["询盘类型", inquiry.inquiryType], ["产品", inquiry.product ? `${inquiry.product.name} (${inquiry.product.productCode})` : null],
        ["兴趣", inquiry.interests.join("、")], ["来源", inquiry.sourceRoute], ["提交时间", formatDate(inquiry.createdAt)], ["留言", inquiry.message],
      ]) {
        context.appendChild(text("dt", String(label))); context.appendChild(text("dd", String(value || "—")));
      }

      const assigneeLabel = document.createElement("label");
      assigneeLabel.textContent = "负责人";
      const assigneeSelect = document.createElement("select");
      assigneeSelect.appendChild(new Option("未分配", ""));
      for (const user of assignees) assigneeSelect.appendChild(new Option(`${user.displayName} (${user.role})`, user.id));
      assigneeSelect.value = inquiry.assignee?.id ?? "";
      assigneeLabel.appendChild(assigneeSelect);
      const saveAssignee = button("保存负责人", "admin-primary-button");

      const transitionLabel = document.createElement("label");
      transitionLabel.textContent = "转换状态";
      const transitionSelect = document.createElement("select");
      for (const status of transitions[inquiry.status] ?? []) transitionSelect.appendChild(new Option(statusLabels[status] ?? status, status));
      transitionLabel.appendChild(transitionSelect);
      const transition = button("更新状态", "admin-secondary-button");
      transition.disabled = transitionSelect.options.length === 0;

      const actions = document.createElement("div");
      actions.className = "operation-actions";
      for (const control of [assigneeLabel, saveAssignee, transitionLabel, transition]) actions.appendChild(control);
      const feedback = text("p", "");
      feedback.dataset.inquiryFeedback = "";
      feedback.setAttribute("aria-live", "polite");

      const noteHeading = text("h3", "内部备注");
      const noteLabel = document.createElement("label");
      noteLabel.textContent = "内部备注";
      const noteInput = document.createElement("textarea");
      noteInput.rows = 4;
      noteLabel.appendChild(noteInput);
      const addNote = button("添加备注", "admin-primary-button");
      const notes = document.createElement("ol");
      notes.className = "operation-notes";
      for (const note of inquiry.notes) {
        const item = document.createElement("li");
        item.appendChild(text("p", note.note)); item.appendChild(text("small", `${note.author.displayName} · ${formatDate(note.createdAt)}`));
        notes.appendChild(item);
      }
      if (!inquiry.notes.length) notes.appendChild(text("li", "暂无备注。"));
      root.replaceChildren(header, text("p", `${statusLabels[inquiry.status] ?? inquiry.status} · ${inquiry.id}`), context, actions, feedback, noteHeading, noteLabel, addNote, notes);

      saveAssignee.addEventListener("click", () => void mutate({ action: "assign", assigneeUserId: assigneeSelect.value || null }));
      transition.addEventListener("click", () => void mutate({ action: "transition", status: transitionSelect.value }));
      addNote.addEventListener("click", () => {
        if (!noteInput.value.trim()) { feedback.textContent = "请输入备注。"; return; }
        void mutate({ action: "note", note: noteInput.value.trim() });
      });

      async function mutate(operation: Record<string, unknown>): Promise<void> {
        for (const control of [saveAssignee, transition, addNote]) control.disabled = true;
        feedback.textContent = "正在保存…";
        try {
          const response = await fetch(`/api/admin/inquiries/${encodeURIComponent(inquiry.id)}`, {
            method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ version: 1, updatedAt: inquiry.updatedAt, ...operation }),
          });
          const body = await response.json() as { ok: boolean; data?: Inquiry; error?: { message?: string } };
          if (!response.ok || !body.ok || !body.data) throw new Error(body.error?.message ?? "保存失败。");
          inquiry = await getInquiry(inquiry.id);
          onChanged();
          render();
          const currentFeedback = root.querySelector<HTMLElement>("[data-inquiry-feedback]");
          if (currentFeedback) currentFeedback.textContent = "已保存。";
        } catch (error) {
          feedback.setAttribute("role", "alert");
          feedback.textContent = error instanceof Error ? error.message : "保存失败。";
          for (const control of [saveAssignee, transition, addNote]) control.disabled = false;
        }
      }
    }
  } catch (error) {
    const alert = text("p", error instanceof Error ? error.message : "无法加载询盘。");
    alert.setAttribute("role", "alert");
    root.replaceChildren(alert);
  }
}

async function getInquiry(id: string): Promise<Inquiry> {
  const response = await fetch(`/api/admin/inquiries/${encodeURIComponent(id)}`);
  const body = await response.json() as { ok: boolean; data?: Inquiry; error?: { message?: string } };
  if (!response.ok || !body.ok || !body.data) throw new Error(body.error?.message ?? "无法加载询盘。");
  return body.data;
}

function button(label: string, className: string) { const element = document.createElement("button"); element.type = "button"; element.textContent = label; element.className = className; return element; }
function text<K extends keyof HTMLElementTagNameMap>(tag: K, value: string) { const element = document.createElement(tag); element.textContent = value; return element; }
function formatDate(value: string) { const date = new Date(value); return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(date); }
