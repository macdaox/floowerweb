import { publicMediaUrl } from "../media/schemas";

export interface CatalogImage {
  src: string;
  alt: string;
}

export interface CatalogCategory {
  name: string;
  slug: string;
  description: string;
  image?: CatalogImage;
}

export interface ProductCard {
  name: string;
  slug: string;
  summary: string;
  category: Pick<CatalogCategory, "name" | "slug">;
  image?: CatalogImage;
}

export interface Specification {
  label: string;
  value: string;
}

export interface ProductDetail extends ProductCard {
  id: string;
  productCode: string;
  body: string;
  images: CatalogImage[];
  specifications: Specification[];
  relatedProducts: ProductCard[];
  seo: { title: string; description: string };
}

export interface Page<T> {
  items: T[];
  page: number;
  pageSize: 24;
  total: number;
  totalPages: number;
}

export const PUBLIC_PAGE_SIZE = 24 as const;

export function mediaFromRow(row: Record<string, unknown>): CatalogImage | undefined {
  const src = publicMediaUrl(row);
  return src ? { src, alt: text(row.alt_text) || "EVERSTEM botanical object" } : undefined;
}

export function specificationsFromJson(value: unknown): Specification[] {
  if (typeof value !== "string") return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return [];
    return Object.entries(parsed)
      .filter((entry): entry is [string, string] => typeof entry[1] === "string" && Boolean(entry[0].trim()) && Boolean(entry[1].trim()))
      .map(([label, specification]) => ({ label: humanize(label), value: specification }));
  } catch {
    return [];
  }
}

export function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function humanize(value: string): string {
  return value.replace(/([A-Z])/g, " $1").replaceAll("_", " ").replace(/^./, (first) => first.toUpperCase());
}
