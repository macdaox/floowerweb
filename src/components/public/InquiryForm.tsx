type ApiFailure = { error?: { message?: string; fields?: Record<string, string> } };

const fieldNames: Record<string, string> = { productId: "product_id", buyerType: "buyer_type", interests: "product_interest" };

export function initializeInquiryForms(): void {
  document.querySelectorAll<HTMLFormElement>("[data-inquiry-form]").forEach((form) => {
    if (form.dataset.initialized) return;
    form.dataset.initialized = "true";
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      clearErrors(form);
      const button = form.querySelector<HTMLButtonElement>("button[type=submit]");
      const status = form.querySelector<HTMLElement>("[role=status]");
      const payload = inquiryPayload(form);
      setLoading(form, button, status, true);
      try {
        const response = await fetch("/api/inquiries", {
          method: "POST",
          headers: { "content-type": "application/json", "idempotency-key": idempotencyKey(form, payload) },
          body: JSON.stringify(payload),
        });
        if (response.status === 204 || response.ok) {
          form.reset();
          clearIdempotencyKey(form);
          announce(status, "Thank you. Your enquiry has been received.");
          return;
        }
        const failure = await readFailure(response);
        renderErrors(form, failure.error?.fields);
        announce(status, failure.error?.message ?? "We could not send your enquiry. Please try again.", true);
      } catch {
        announce(status, "We could not send your enquiry. Please check your connection and try again.", true);
      } finally {
        setLoading(form, button, status, false);
      }
    });
  });
}

function inquiryPayload(form: HTMLFormElement) {
  const data = new FormData(form);
  const values = Object.fromEntries(data.entries());
  const interest = stringValue(data.get("product_interest"));
  return {
    inquiryType: form.dataset.inquiryType,
    name: stringValue(data.get("name")),
    email: stringValue(data.get("email")),
    phone: stringValue(data.get("phone")),
    company: stringValue(data.get("company")),
    country: stringValue(data.get("country")),
    buyerType: stringValue(data.get("buyer_type")),
    interests: interest ? [interest] : data.getAll("interests").map(stringValue).filter(Boolean),
    message: stringValue(data.get("message")),
    productId: stringValue(data.get("product_id")),
    sourceRoute: form.dataset.sourceRoute || window.location.pathname,
    website: stringValue(values.website),
  };
}

function clearErrors(form: HTMLFormElement): void {
  form.querySelectorAll<HTMLElement>("[data-field-error]").forEach((error) => { error.textContent = ""; });
  form.querySelectorAll<HTMLElement>("[aria-invalid=true]").forEach((field) => field.removeAttribute("aria-invalid"));
  form.querySelector<HTMLElement>("[role=status]")?.removeAttribute("data-error");
}

function renderErrors(form: HTMLFormElement, fields: Record<string, string> | undefined): void {
  for (const [key, message] of Object.entries(fields ?? {})) {
    const name = fieldNames[key] ?? key;
    const field = form.querySelector(`[name="${name}"]`) as unknown as { setAttribute(name: string, value: string): void } | null;
    field?.setAttribute("aria-invalid", "true");
    const error = form.querySelector<HTMLElement>(`[data-field-error="${name}"]`);
    if (error) error.textContent = message;
  }
}

function setLoading(form: HTMLFormElement, button: HTMLButtonElement | null, status: HTMLElement | null, loading: boolean): void {
  form.setAttribute("aria-busy", String(loading));
  if (!button) return;
  if (loading) {
    button.dataset.label = button.textContent ?? "";
    button.disabled = true;
    button.textContent = "Sending…";
    announce(status, "Sending your enquiry.");
  } else {
    button.disabled = false;
    button.textContent = button.dataset.label ?? button.textContent;
  }
}

function announce(status: HTMLElement | null, message: string, isError = false): void {
  if (!status) return;
  status.textContent = message;
  status.toggleAttribute("data-error", isError);
}

async function readFailure(response: Response): Promise<ApiFailure> {
  try { return await response.json() as ApiFailure; } catch { return {}; }
}

function stringValue(value: FormDataEntryValue | null | undefined): string {
  return typeof value === "string" ? value : "";
}

function idempotencyKey(form: HTMLFormElement, payload: unknown): string {
  const signature = JSON.stringify(payload);
  if (form.dataset.submissionPayload === signature && form.dataset.idempotencyKey) return form.dataset.idempotencyKey;
  const key = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  form.dataset.submissionPayload = signature;
  form.dataset.idempotencyKey = key;
  return key;
}

function clearIdempotencyKey(form: HTMLFormElement): void {
  delete form.dataset.submissionPayload;
  delete form.dataset.idempotencyKey;
}
