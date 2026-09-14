CREATE TABLE submission_idempotency_keys (
  key TEXT PRIMARY KEY,
  submission_type TEXT NOT NULL CHECK (submission_type IN ('inquiry', 'subscriber')),
  payload_hash TEXT NOT NULL,
  inquiry_id TEXT REFERENCES inquiries(id),
  subscriber_id TEXT REFERENCES subscribers(id),
  created_at TEXT NOT NULL,
  CHECK (
    (submission_type = 'inquiry' AND inquiry_id IS NOT NULL AND subscriber_id IS NULL) OR
    (submission_type = 'subscriber' AND inquiry_id IS NULL AND subscriber_id IS NOT NULL)
  )
);
CREATE INDEX submission_idempotency_inquiry_idx ON submission_idempotency_keys (inquiry_id);
CREATE INDEX submission_idempotency_subscriber_idx ON submission_idempotency_keys (subscriber_id);
