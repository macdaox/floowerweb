import type { CatalogImage } from "../../features/catalog/schemas";

/** Client-friendly gallery state; the server page retains the accessible image markup. */
export function selectGalleryImage(images: CatalogImage[], index: number): CatalogImage | undefined {
  return images[Math.max(0, Math.min(index, images.length - 1))];
}
