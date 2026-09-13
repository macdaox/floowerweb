export function initializeMobileMenu(): void {
  const button = document.querySelector<HTMLButtonElement>("[data-menu-button]");
  const menu = document.querySelector<HTMLElement>("[data-menu]");
  if (!button || !menu || button.dataset.initialized) return;

  button.dataset.initialized = "true";
  const close = (restoreFocus = false) => {
    button.setAttribute("aria-expanded", "false");
    menu.classList.remove("is-open");
    document.body.classList.remove("menu-open");
    if (restoreFocus) button.focus();
  };

  button.addEventListener("click", () => {
    const open = button.getAttribute("aria-expanded") !== "true";
    button.setAttribute("aria-expanded", String(open));
    menu.classList.toggle("is-open", open);
    document.body.classList.toggle("menu-open", open);
    if (open) menu.querySelector<HTMLAnchorElement>("a")?.focus();
  });
  menu.addEventListener("click", (event) => {
    if ((event.target as Element).closest("a")) close();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && button.getAttribute("aria-expanded") === "true") close(true);
  });
}
