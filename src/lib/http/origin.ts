import { HttpError } from "./errors";

export function assertAllowedOrigin(request: Request, siteUrl: string): void {
  const origin = request.headers.get("origin");

  try {
    if (!origin || new URL(origin).origin !== new URL(siteUrl).origin) {
      throw new HttpError("origin_forbidden", "This request origin is not allowed.", 403);
    }
  } catch (error) {
    if (error instanceof HttpError) {
      throw error;
    }

    throw new HttpError("origin_forbidden", "This request origin is not allowed.", 403);
  }
}
