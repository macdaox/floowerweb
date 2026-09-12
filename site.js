document.documentElement.classList.add("js");

const menuButton = document.querySelector("[data-menu-button]");
const menu = document.querySelector("[data-menu]");

function closeMenu({ restoreFocus = false } = {}) {
  if (!menuButton || !menu) return;
  menuButton.setAttribute("aria-expanded", "false");
  menu.classList.remove("is-open");
  if (restoreFocus) menuButton.focus();
}

if (menuButton && menu) {
  menuButton.addEventListener("click", () => {
    const willOpen = menuButton.getAttribute("aria-expanded") !== "true";
    menuButton.setAttribute("aria-expanded", String(willOpen));
    menu.classList.toggle("is-open", willOpen);
  });

  menu.addEventListener("click", (event) => {
    if (event.target.closest("a")) closeMenu();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && menuButton.getAttribute("aria-expanded") === "true") {
      closeMenu({ restoreFocus: true });
    }
  });
}

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const revealItems = document.querySelectorAll("[data-reveal]");

if (reduceMotion || !("IntersectionObserver" in window)) {
  revealItems.forEach((item) => item.classList.add("is-visible"));
} else {
  const observer = new IntersectionObserver((entries, activeObserver) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add("is-visible");
      activeObserver.unobserve(entry.target);
    });
  }, { rootMargin: "0px 0px -8%", threshold: 0.08 });

  revealItems.forEach((item) => observer.observe(item));
}

const newsletter = document.querySelector(".newsletter");
newsletter?.addEventListener("submit", (event) => event.preventDefault());

const catalogForm = document.querySelector("#catalog-form");
catalogForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  const status = catalogForm.querySelector(".form-status");
  if (status) status.textContent = "Thank you. Your wholesale catalog request is ready for review.";
});
