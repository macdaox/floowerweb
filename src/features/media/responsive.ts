export interface ResponsiveMedia {
  src: string;
  alt?: string;
  width?: number;
  height?: number;
}

export interface DynamicImageOptions {
  resizingOrigin?: string;
  widths: number[];
  fallbackWidth?: number;
  fallbackHeight?: number;
}

export interface DynamicImageAttributes {
  src: string;
  width: number;
  height: number;
  srcset?: string;
}

export function dynamicImageAttributes(image: ResponsiveMedia, options: DynamicImageOptions): DynamicImageAttributes {
  const width = positiveInteger(image.width) ?? positiveInteger(options.fallbackWidth);
  const height = positiveInteger(image.height) ?? positiveInteger(options.fallbackHeight);
  if (!width || !height) throw new Error("Responsive images require intrinsic width and height.");

  const resizingOrigin = validateResizingOrigin(options.resizingOrigin);
  if (!resizingOrigin || !image.src.startsWith("/media/")) return { src: image.src, width, height };

  const widths = [...new Set(options.widths.map(positiveInteger).filter((candidate): candidate is number => Boolean(candidate)))]
    .filter((candidate) => candidate < width)
    .concat(width)
    .sort((left, right) => left - right);
  return {
    src: image.src,
    width,
    height,
    srcset: widths.map((candidate) => `${resizingOrigin}/cdn-cgi/image/width=${candidate},fit=scale-down,format=auto${image.src} ${candidate}w`).join(", "),
  };
}

function validateResizingOrigin(configured: string | undefined): string | undefined {
  if (!configured?.trim()) return undefined;
  let url: URL;
  try {
    url = new URL(configured.trim());
  } catch {
    throw new Error("PUBLIC_IMAGE_RESIZING_ORIGIN must be a valid HTTPS origin.");
  }
  if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("PUBLIC_IMAGE_RESIZING_ORIGIN must be a credential-free HTTPS origin with no path, query, or fragment.");
  }
  return url.origin;
}

function positiveInteger(value: unknown): number | undefined {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}
