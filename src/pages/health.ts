export function GET(_context?: unknown): Response {
  return Response.json({ ok: true, service: "everstem" });
}
