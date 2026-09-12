import { sql } from "drizzle-orm";
import type { AppDb } from "../db/types";
import { HttpError } from "./errors";

const EXPIRED_COUNTER_CLEANUP_BATCH_SIZE = 100;

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
  await db.run(sql`
    DELETE FROM rate_limits
    WHERE key IN (
      SELECT key
      FROM rate_limits
      WHERE expires_at <= ${now}
      ORDER BY expires_at
      LIMIT ${EXPIRED_COUNTER_CLEANUP_BATCH_SIZE}
    )
  `);
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
