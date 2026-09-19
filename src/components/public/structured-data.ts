import type { ProductDetail } from "../../features/catalog/schemas";
import type { ArticleDetail, SpaceDetail } from "../../features/content/schemas";

export interface BreadcrumbItem {
  name: string;
  path: string;
}

export function breadcrumbData(origin: string, items: BreadcrumbItem[]): Record<string, unknown> {
  return {
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: new URL(item.path, origin).href,
    })),
  };
}

export function productData(origin: string, product: ProductDetail): Record<string, unknown> {
  return {
    "@type": "Product",
    "@id": `${new URL(`/products/${product.slug}`, origin).href}#product`,
    name: product.name,
    description: product.seo.description,
    sku: product.productCode,
    category: product.category.name,
    url: new URL(`/products/${product.slug}`, origin).href,
    image: product.images.map((image) => new URL(image.src, origin).href),
    brand: { "@id": `${origin}/#organization` },
  };
}

export function articleData(origin: string, article: ArticleDetail): Record<string, unknown> {
  return {
    "@type": "Article",
    "@id": `${new URL(`/journal/${article.slug}`, origin).href}#article`,
    headline: article.title,
    description: article.seo.description,
    url: new URL(`/journal/${article.slug}`, origin).href,
    mainEntityOfPage: new URL(`/journal/${article.slug}`, origin).href,
    ...(article.image ? { image: new URL(article.image.src, origin).href } : {}),
    ...(article.publishedAt ? { datePublished: article.publishedAt } : {}),
    author: article.author ? { "@type": "Organization", name: article.author } : { "@id": `${origin}/#organization` },
    publisher: { "@id": `${origin}/#organization` },
  };
}

export function spaceData(origin: string, space: SpaceDetail): Record<string, unknown> {
  return {
    "@type": "CreativeWork",
    "@id": `${new URL(`/spaces/${space.slug}`, origin).href}#case-study`,
    name: space.title,
    description: space.seo.description,
    url: new URL(`/spaces/${space.slug}`, origin).href,
    ...(space.images.length ? { image: space.images.map((image) => new URL(image.src, origin).href) } : {}),
    creator: { "@id": `${origin}/#organization` },
  };
}
