import type { InquiryInput, SubscriberInput } from "./schemas";

export interface SubmissionKeyRecord {
  submissionType: "inquiry" | "subscriber";
  payloadHash: string;
  inquiryId: string | null;
  subscriberId: string | null;
}

export async function findSubmissionKey(db: D1Database, key: string): Promise<SubmissionKeyRecord | null> {
  return db.prepare(`SELECT submission_type AS submissionType, payload_hash AS payloadHash,
    inquiry_id AS inquiryId, subscriber_id AS subscriberId
    FROM submission_idempotency_keys WHERE key = ? LIMIT 1`).bind(key).first<SubmissionKeyRecord>();
}

export async function insertInquiry(
  db: D1Database,
  input: InquiryInput,
  { id, idempotencyKey, payloadHash, createdAt }: { id: string; idempotencyKey?: string; payloadHash?: string; createdAt: string },
): Promise<void> {
  const statements = [db.prepare(`INSERT INTO inquiries (
    id, inquiry_type, name, email, phone, company, country, buyer_type, message, product_id, source_route,
    status, created_at, updated_at, idempotency_key
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new', ?, ?, ?)`)
    .bind(id, input.inquiryType, input.name, input.email, input.phone ?? null, input.company ?? null, input.country ?? null,
      input.buyerType ?? null, input.message ?? null, input.productId ?? null, input.sourceRoute, createdAt, createdAt, idempotencyKey ?? null)];
  if (input.interests.length > 0) {
    statements.push(...input.interests.map((interest) => db.prepare("INSERT INTO inquiry_interests (inquiry_id, interest, created_at) VALUES (?, ?, ?)").bind(id, interest, createdAt)));
  }
  if (idempotencyKey && payloadHash) statements.push(submissionKeyStatement(db, idempotencyKey, "inquiry", payloadHash, id, null, createdAt));
  await db.batch(statements);
}

export async function publishedProductExists(db: D1Database, productId: string): Promise<boolean> {
  const row = await db.prepare("SELECT 1 AS found FROM products WHERE id = ? AND status = 'published' LIMIT 1").bind(productId).first<{ found: number }>();
  return Boolean(row?.found);
}

export async function findSubscriberByEmail(db: D1Database, email: string): Promise<{ id: string; email: string } | null> {
  return db.prepare("SELECT id, email FROM subscribers WHERE email = ? LIMIT 1").bind(email).first<{ id: string; email: string }>();
}

export async function insertSubscriber(
  db: D1Database,
  input: SubscriberInput,
  { id, idempotencyKey, payloadHash, createdAt }: { id: string; idempotencyKey?: string; payloadHash?: string; createdAt: string },
): Promise<void> {
  const statements = [db.prepare(`INSERT INTO subscribers (id, email, source, status, subscribed_at, created_at, updated_at, idempotency_key)
    VALUES (?, ?, ?, 'subscribed', ?, ?, ?, ?)`)
    .bind(id, input.email, input.source, createdAt, createdAt, createdAt, idempotencyKey ?? null)];
  if (idempotencyKey && payloadHash) statements.push(submissionKeyStatement(db, idempotencyKey, "subscriber", payloadHash, null, id, createdAt));
  await db.batch(statements);
}

export async function reactivateSubscriber(
  db: D1Database,
  subscriberId: string,
  email: string,
  source: string,
  { idempotencyKey, payloadHash, updatedAt }: { idempotencyKey?: string; payloadHash?: string; updatedAt: string },
): Promise<void> {
  const statements = [db.prepare(`UPDATE subscribers
    SET source = ?, status = 'subscribed', subscribed_at = ?, unsubscribed_at = NULL, updated_at = ?
    WHERE email = ?`).bind(source, updatedAt, updatedAt, email)];
  if (idempotencyKey && payloadHash) statements.push(submissionKeyStatement(db, idempotencyKey, "subscriber", payloadHash, null, subscriberId, updatedAt));
  await db.batch(statements);
}

function submissionKeyStatement(db: D1Database, key: string, submissionType: "inquiry" | "subscriber", payloadHash: string, inquiryId: string | null, subscriberId: string | null, createdAt: string) {
  return db.prepare(`INSERT INTO submission_idempotency_keys
    (key, submission_type, payload_hash, inquiry_id, subscriber_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?)`)
    .bind(key, submissionType, payloadHash, inquiryId, subscriberId, createdAt);
}
