import type { APIRoute } from "astro";
import { requireRole } from "../../../../features/auth/authorize";
import { HttpError } from "../../../../lib/http/errors";
import { fail } from "../../../../lib/http/result";
import { querySubscribers } from "./index";

export const GET: APIRoute = async ({ request, locals }) => {
  try {
    requireRole(locals, ["admin", "sales"]);
    const result = await querySubscribers(locals.runtime.env.DB, new URL(request.url).searchParams, false);
    const header = ["email", "source", "status", "subscribed_at", "unsubscribed_at"];
    const lines = result.items.map((item) => {
      const row = item as Record<string, unknown>;
      return [row.email, row.source, row.status, row.subscribedAt, row.unsubscribedAt].map(csvCell).join(",");
    });
    return new Response(`\ufeff${[header.join(","), ...lines].join("\r\n")}\r\n`, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": "attachment; filename=\"subscribers.csv\"",
        "cache-control": "private, no-store",
      },
    });
  } catch (error) {
    if (error instanceof HttpError) return fail(error.code, error.message, error.status, error.fields);
    return fail("internal_error", "Unable to export subscribers.", 500);
  }
};

/** Escapes a value for RFC 4180 CSV and prevents spreadsheet formula execution. */
export function csvCell(value: unknown): string {
  let text = value == null ? "" : String(value);
  if (/^(?:\s*[=+@-]|[\t\r])/u.test(text)) text = `'${text}`;
  return /[",\r\n]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}
