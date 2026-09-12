export function ok<T>(data: T, status = 200): Response {
  return Response.json({ ok: true, data }, { status });
}

export function fail(
  code: string,
  message: string,
  status: number,
  fields?: Record<string, string>,
): Response {
  return Response.json({
    ok: false,
    error: {
      code,
      message,
      ...(fields && Object.keys(fields).length > 0 ? { fields } : {}),
    },
  }, { status });
}
