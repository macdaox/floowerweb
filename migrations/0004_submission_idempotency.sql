ALTER TABLE inquiries ADD COLUMN idempotency_key TEXT;
CREATE UNIQUE INDEX inquiries_idempotency_key_unique ON inquiries (idempotency_key) WHERE idempotency_key IS NOT NULL;

ALTER TABLE subscribers ADD COLUMN idempotency_key TEXT;
CREATE UNIQUE INDEX subscribers_idempotency_key_unique ON subscribers (idempotency_key) WHERE idempotency_key IS NOT NULL;
