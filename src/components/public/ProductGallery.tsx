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
    gallery.addEventListener("keydown", (event) => {
      const current = (event.target as Element).closest<HTMLElement>("[data-gallery-item]");
      const currentIndex = current ? items.indexOf(current) : -1;
      if (currentIndex < 0) return;
      const nextIndex = galleryIndexForKey((event as KeyboardEvent).key, currentIndex, items.length);
      if (nextIndex === currentIndex) return;
      event.preventDefault();
      items.forEach((item, index) => item.setAttribute("tabindex", index === nextIndex ? "0" : "-1"));
      items[nextIndex]?.focus();
    });
  });
}

function galleryIndexForKey(key: string, current: number, length: number): number {
  if (key === "Home") return 0;
  if (key === "End") return length - 1;
  if (key === "ArrowRight" || key === "ArrowDown") return (current + 1) % length;
  if (key === "ArrowLeft" || key === "ArrowUp") return (current - 1 + length) % length;
  return current;
}
