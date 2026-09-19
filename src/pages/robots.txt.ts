import type { APIRoute } from "astro";
import { resolvePublicSiteOrigin } from "../features/public/site-origin";

export const GET: APIRoute = ({ locals }) => {
  const origin = resolvePublicSiteOrigin(locals.runtime?.env?.PUBLIC_SITE_URL);
  const body = [
    "User-agent: *",
    "Allow: /",
    "Disallow: /admin",
    "Disallow: /api",
    "Disallow: /preview",
    `Sitemap: ${origin}/sitemap.xml`,
    "",
  ].join("\n");

  return new Response(body, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=3600",
    },
  });
};
