import type { APIRoute } from "astro";
import { requireRole } from "../../../features/auth/authorize";
import { HttpError } from "../../../lib/http/errors";
import { fail, ok } from "../../../lib/http/result";

type CountRow = { count: number };
type RecentInquiry = { id: string; name: string; email: string; company: string | null; status: "new" | "contacted" | "qualified" | "closed" | "spam"; inquiryType: string; createdAt: string };

export const GET: APIRoute = async ({ locals }) => {
  try {
    requireRole(locals, ["admin", "editor", "sales"]);
    const database = locals.runtime.env.DB;
    const weekStart = new Date(Date.now() - 7 * 24 * 60 * 60 * 1_000).toISOString();
    const [newInquiries, inquiriesThisWeek, activeSubscribers, publishedProducts, recent] = await Promise.all([
      database.prepare("SELECT COUNT(*) AS count FROM inquiries WHERE status = 'new'").first<CountRow>(),
      database.prepare("SELECT COUNT(*) AS count FROM inquiries WHERE created_at >= ?").bind(weekStart).first<CountRow>(),
      database.prepare("SELECT COUNT(*) AS count FROM subscribers WHERE status = 'subscribed'").first<CountRow>(),
      database.prepare("SELECT COUNT(*) AS count FROM products WHERE status = 'published'").first<CountRow>(),
      database.prepare(`SELECT id, name, email, company, status, inquiry_type AS inquiryType, created_at AS createdAt
        FROM inquiries ORDER BY created_at DESC LIMIT 5`).all<RecentInquiry>(),
    ]);
    return ok({
      metrics: { newInquiries: newInquiries?.count ?? 0, inquiriesThisWeek: inquiriesThisWeek?.count ?? 0, activeSubscribers: activeSubscribers?.count ?? 0, publishedProducts: publishedProducts?.count ?? 0 },
      recentInquiries: recent.results,
    });
  } catch (error) {
    if (error instanceof HttpError) return fail(error.code, error.message, error.status, error.fields);
    return fail("internal_error", "Unable to load the dashboard.", 500);
  }
};
