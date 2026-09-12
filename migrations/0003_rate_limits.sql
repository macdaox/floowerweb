CREATE TABLE rate_limits (
  key TEXT PRIMARY KEY,
  window_started_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  count INTEGER NOT NULL CHECK (count >= 0)
);
CREATE INDEX rate_limits_expires_at_idx ON rate_limits (expires_at);
