export const LOCAL_PUBLIC_SITE_ORIGIN = "http://127.0.0.1:4321";
export const PRODUCTION_PUBLIC_SITE_ORIGIN = "https://floowerweb.zhaomeili1016.workers.dev";

export function resolvePublicSiteOrigin(
  configured: string | undefined,
  { allowLocalDefault = import.meta.env.DEV }: { allowLocalDefault?: boolean } = {},
): string {
  const value = configured?.trim();
  if (!value) {
    if (allowLocalDefault) return LOCAL_PUBLIC_SITE_ORIGIN;
    return PRODUCTION_PUBLIC_SITE_ORIGIN;
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("PUBLIC_SITE_URL must be a valid absolute URL.");
  }

  const localHttp = allowLocalDefault && url.protocol === "http:" && (url.hostname === "127.0.0.1" || url.hostname === "localhost");
  if (
    (!localHttp && url.protocol !== "https:")
    || url.username
    || url.password
    || url.pathname !== "/"
    || url.search
    || url.hash
  ) {
    throw new Error("PUBLIC_SITE_URL must be a credential-free HTTPS origin with no path, query, or fragment.");
  }

  return url.origin;
}
