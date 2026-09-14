type ApiFailure = { error?: { message?: string; fields?: Record<string, string> } };

export function initializeNewsletterForms(): void {
  document.querySelectorAll<HTMLFormElement>("[data-newsletter-form]").forEach((form) => {
    if (form.dataset.initialized) return;
    form.dataset.initialized = "true";
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const email = form.elements.namedItem("email") as HTMLInputElement | null;
      const button = form.querySelector<HTMLButtonElement>("button[type=submit]");
      const status = form.querySelector<HTMLElement>("[role=status]");
      email?.removeAttribute("aria-invalid");
      form.querySelector<HTMLElement>("[data-field-error=email]")!.textContent = "";
      const payload = { email: email?.value ?? "", source: form.dataset.sourceRoute || window.location.pathname, website: (form.elements.namedItem("website") as HTMLInputElement | null)?.value ?? "" };
      setLoading(form, button, status, true);
      try {
        const response = await fetch("/api/subscribers", {
          method: "POST",
          headers: { "content-type": "application/json", "idempotency-key": idempotencyKey(form, payload) },
          body: JSON.stringify(payload),
        });
        if (response.status === 204 || response.ok) {
          form.reset();
          clearIdempotencyKey(form);
          announce(status, "You’re subscribed. Thank you.");
          return;
        }
        const failure = await readFailure(response);
        if (failure.error?.fields?.email) {
          email?.setAttribute("aria-invalid", "true");
          const error = form.querySelector<HTMLElement>("[data-field-error=email]");
          if (error) error.textContent = failure.error.fields.email;
        }
        announce(status, failure.error?.message ?? "We could not subscribe you. Please try again.", true);
      } catch {
        announce(status, "We could not subscribe you. Please check your connection and try again.", true);
      } finally {
        setLoading(form, button, status, false);
      }
    });
  });
}

function setLoading(form: HTMLFormElement, button: HTMLButtonElement | null, status: HTMLElement | null, loading: boolean): void {
  form.setAttribute("aria-busy", String(loading));
  if (!button) return;
  if (loading) {
    button.dataset.label = button.textContent ?? "";
    button.disabled = true;
    button.textContent = "Subscribing…";
    announce(status, "Subscribing.");
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
