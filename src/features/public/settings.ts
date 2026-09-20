export interface PublicSiteSettings {
  companyName: string;
  tagline: string;
  companyDescription: string;
  contactEmail?: string;
  instagramUrl?: string;
  pinterestUrl?: string;
  linkedinUrl?: string;
  defaultSeoTitle: string;
  defaultSeoDescription: string;
}

export const fallbackPublicSiteSettings: PublicSiteSettings = {
  companyName: "EVERSTEM",
  tagline: "Botanical objects for contemporary spaces.",
  companyDescription: "Artificial flowers, plants and trees for wholesale buyers worldwide.",
  defaultSeoTitle: "EVERSTEM | Artificial Flowers and Botanical Objects",
  defaultSeoDescription: "Artificial flowers, plants and trees for wholesale buyers worldwide.",
};

export async function loadPublicSiteSettings(db?: D1Database): Promise<PublicSiteSettings> {
  if (!db) return { ...fallbackPublicSiteSettings };
  try {
    const row = await db.prepare(`SELECT company_name, tagline, company_description, contact_email,
      instagram_url, pinterest_url, linkedin_url, default_seo_title, default_seo_description
      FROM settings WHERE id = 'site' LIMIT 1`).first<Record<string, unknown>>();
    if (!row) return { ...fallbackPublicSiteSettings };
    return {
      companyName: text(row.company_name) || fallbackPublicSiteSettings.companyName,
      tagline: text(row.tagline) || fallbackPublicSiteSettings.tagline,
      companyDescription: text(row.company_description) || fallbackPublicSiteSettings.companyDescription,
      contactEmail: email(row.contact_email),
      instagramUrl: webUrl(row.instagram_url),
      pinterestUrl: webUrl(row.pinterest_url),
      linkedinUrl: webUrl(row.linkedin_url),
      defaultSeoTitle: text(row.default_seo_title) || fallbackPublicSiteSettings.defaultSeoTitle,
      defaultSeoDescription: text(row.default_seo_description) || fallbackPublicSiteSettings.defaultSeoDescription,
    };
  } catch {
    return { ...fallbackPublicSiteSettings };
  }
}

function text(value: unknown): string { return typeof value === "string" ? value.trim() : ""; }
function email(value: unknown): string | undefined { const result = text(value); return /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(result) ? result : undefined; }
function webUrl(value: unknown): string | undefined {
  const result = text(value);
  try { const parsed = new URL(result); return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.href : undefined; } catch { return undefined; }
}
