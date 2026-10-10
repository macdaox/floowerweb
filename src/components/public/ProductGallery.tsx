import type { CatalogImage } from "../../features/catalog/schemas";

/** Client-friendly gallery state; the server page retains the accessible image markup. */
export function selectGalleryImage(images: CatalogImage[], index: number): CatalogImage | undefined {
  return images[Math.max(0, Math.min(index, images.length - 1))];
}

export function initializeProductGalleries(): void {
  document.querySelectorAll<HTMLElement>("[data-product-gallery]").forEach((gallery) => {
    if (gallery.dataset.initialized) return;
    gallery.dataset.initialized = "true";
    const items = [...gallery.querySelectorAll<HTMLElement>("[data-gallery-item]")];
    items.forEach((item, index) => item.setAttribute("tabindex", index === 0 ? "0" : "-1"));
    if (items.length < 2) return;
    const count = gallery.querySelector<HTMLElement>("[data-gallery-count]");
    let activeIndex = 0;
    function show(index: number, focus = false): void {
      activeIndex = (index + items.length) % items.length;
      items.forEach((item, itemIndex) => {
        item.hidden = itemIndex !== activeIndex;
        item.tabIndex = itemIndex === activeIndex ? 0 : -1;
      });
      if (count) count.textContent = `${activeIndex + 1} / ${items.length}`;
      if (focus) items[activeIndex]?.focus();
    }
    gallery.querySelector("[data-gallery-previous]")?.addEventListener("click", () => show(activeIndex - 1));
    gallery.querySelector("[data-gallery-next]")?.addEventListener("click", () => show(activeIndex + 1));
    gallery.addEventListener("keydown", (event) => {
      const current = (event.target as Element).closest<HTMLElement>("[data-gallery-item]");
      const currentIndex = current ? items.indexOf(current) : -1;
      if (currentIndex < 0) return;
      const nextIndex = galleryIndexForKey((event as KeyboardEvent).key, currentIndex, items.length);
      if (nextIndex === currentIndex) return;
      event.preventDefault();
      show(nextIndex, true);
    });
    let touchStartX: number | null = null;
    let touchStartY: number | null = null;
    gallery.addEventListener("touchstart", (event) => {
      if (!event.target || !(event.target as Element).closest("[data-gallery-item]")) return;
      touchStartX = event.touches[0]?.clientX ?? null;
      touchStartY = event.touches[0]?.clientY ?? null;
    }, { passive: true });
    gallery.addEventListener("touchend", (event) => {
      if (touchStartX === null || touchStartY === null) return;
      const deltaX = (event.changedTouches[0]?.clientX ?? touchStartX) - touchStartX;
      const deltaY = (event.changedTouches[0]?.clientY ?? touchStartY) - touchStartY;
      touchStartX = null;
      touchStartY = null;
      if (Math.abs(deltaX) > 45 && Math.abs(deltaX) > Math.abs(deltaY)) show(activeIndex + (deltaX < 0 ? 1 : -1));
    }, { passive: true });
  });
}

function galleryIndexForKey(key: string, current: number, length: number): number {
  if (key === "Home") return 0;
  if (key === "End") return length - 1;
  if (key === "ArrowRight" || key === "ArrowDown") return (current + 1) % length;
  if (key === "ArrowLeft" || key === "ArrowUp") return (current - 1 + length) % length;
  return current;
}
