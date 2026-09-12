import { sql } from "drizzle-orm";
import type { AppDb } from "../db/types";
import { HttpError } from "./errors";

export async function consumeRateLimit(
  db: AppDb,
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<boolean> {
  if (!key || !Number.isSafeInteger(limit) || limit < 1 || !Number.isSafeInteger(windowSeconds) || windowSeconds < 1) {
    throw new HttpError("invalid_rate_limit", "Rate limit configuration is invalid.", 500);
  }

  const windowMilliseconds = windowSeconds * 1_000;
  if (!Number.isSafeInteger(windowMilliseconds)) {
    throw new HttpError("invalid_rate_limit", "Rate limit configuration is invalid.", 500);
  }

  const now = Date.now();
  const windowStartedAt = Math.floor(now / windowMilliseconds) * windowMilliseconds;
  const expiresAt = windowStartedAt + windowMilliseconds;
  const row = await db.get<{ count: number }>(sql`
    INSERT INTO rate_limits (key, window_started_at, expires_at, count)
    VALUES (${key}, ${windowStartedAt}, ${expiresAt}, 1)
    ON CONFLICT(key) DO UPDATE SET
      window_started_at = excluded.window_started_at,
      expires_at = excluded.expires_at,
      count = CASE
        WHEN rate_limits.window_started_at = excluded.window_started_at THEN rate_limits.count + 1
        ELSE 1
      END
    RETURNING count
  `);

  return (row?.count ?? limit + 1) <= limit;
}
