import type { APIRoute } from "astro";
import { requireRole } from "../../../features/auth/authorize";
import { HttpError } from "../../../lib/http/errors";
import { fail, ok } from "../../../lib/http/result";

type CountRow = { count: number };
type RecentInquiry = { id: string; name: string; email: string; company: string | null; status: "new" | "contacted" | "qualified" | "closed" | "spam"; inquiryType: string; createdAt: string };

export const GET: APIRoute = async ({ locals }) => {
  try {
    const user = requireRole(locals, ["admin", "editor", "sales"]);
    const database = locals.runtime.env.DB;
    if (user.role === "editor") {
      const [draftProducts, publishedProducts, draftSpaces, draftArticles] = await Promise.all([
        database.prepare("SELECT COUNT(*) AS count FROM products WHERE status = 'draft'").first<CountRow>(),
        database.prepare("SELECT COUNT(*) AS count FROM products WHERE status = 'published'").first<CountRow>(),
        database.prepare("SELECT COUNT(*) AS count FROM spaces WHERE status = 'draft'").first<CountRow>(),
        database.prepare("SELECT COUNT(*) AS count FROM articles WHERE status = 'draft'").first<CountRow>(),
      ]);
      return ok({
        kind: "content" as const,
        metrics: {
          draftProducts: draftProducts?.count ?? 0,
          publishedProducts: publishedProducts?.count ?? 0,
          draftSpaces: draftSpaces?.count ?? 0,
          draftArticles: draftArticles?.count ?? 0,
        },
      });
    }

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1_000).toISOString();
    const [newInquiries, recentSevenDays, activeSubscribers, publishedProducts, recent] = await Promise.all([
      database.prepare("SELECT COUNT(*) AS count FROM inquiries WHERE status = 'new'").first<CountRow>(),
      database.prepare("SELECT COUNT(*) AS count FROM inquiries WHERE created_at >= ?").bind(sevenDaysAgo).first<CountRow>(),
      database.prepare("SELECT COUNT(*) AS count FROM subscribers WHERE status = 'subscribed'").first<CountRow>(),
      database.prepare("SELECT COUNT(*) AS count FROM products WHERE status = 'published'").first<CountRow>(),
      database.prepare(`SELECT id, name, email, company, status, inquiry_type AS inquiryType, created_at AS createdAt
        FROM inquiries ORDER BY created_at DESC LIMIT 5`).all<RecentInquiry>(),
    ]);
    return ok({
      kind: "sales" as const,
      metrics: { newInquiries: newInquiries?.count ?? 0, recentSevenDays: recentSevenDays?.count ?? 0, activeSubscribers: activeSubscribers?.count ?? 0, publishedProducts: publishedProducts?.count ?? 0 },
      recentInquiries: recent.results,
    });
  } catch (error) {
    if (error instanceof HttpError) return fail(error.code, error.message, error.status, error.fields);
    return fail("internal_error", "Unable to load the dashboard.", 500);
  }
};
