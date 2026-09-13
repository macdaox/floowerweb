import type { InquiryInput, SubscriberInput } from "./schemas";

export interface InquiryRecord {
  id: string;
  status: "new";
}

export async function findInquiryByIdempotencyKey(db: D1Database, key: string): Promise<InquiryRecord | null> {
  return db.prepare("SELECT id, status FROM inquiries WHERE idempotency_key = ? LIMIT 1").bind(key).first<InquiryRecord>();
}

export async function insertInquiry(
  db: D1Database,
  input: InquiryInput,
  { id, idempotencyKey, createdAt }: { id: string; idempotencyKey?: string; createdAt: string },
): Promise<void> {
  await db.prepare(`INSERT INTO inquiries (
    id, inquiry_type, name, email, phone, company, country, buyer_type, message, product_id, source_route,
    status, created_at, updated_at, idempotency_key
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new', ?, ?, ?)`)
    .bind(id, input.inquiryType, input.name, input.email, input.phone ?? null, input.company ?? null, input.country ?? null,
      input.buyerType ?? null, input.message ?? null, input.productId ?? null, input.sourceRoute, createdAt, createdAt, idempotencyKey ?? null)
    .run();
  if (input.interests.length > 0) {
    await db.batch(input.interests.map((interest) => db.prepare("INSERT INTO inquiry_interests (inquiry_id, interest, created_at) VALUES (?, ?, ?)").bind(id, interest, createdAt)));
  }
}

export async function publishedProductExists(db: D1Database, productId: string): Promise<boolean> {
  const row = await db.prepare("SELECT 1 AS found FROM products WHERE id = ? AND status = 'published' LIMIT 1").bind(productId).first<{ found: number }>();
  return Boolean(row?.found);
}

export async function findSubscriberByEmail(db: D1Database, email: string): Promise<{ email: string } | null> {
  return db.prepare("SELECT email FROM subscribers WHERE email = ? LIMIT 1").bind(email).first<{ email: string }>();
}

export async function findSubscriberByIdempotencyKey(db: D1Database, key: string): Promise<{ email: string } | null> {
  return db.prepare("SELECT email FROM subscribers WHERE idempotency_key = ? LIMIT 1").bind(key).first<{ email: string }>();
}

export async function insertSubscriber(
  db: D1Database,
  input: SubscriberInput,
  { id, idempotencyKey, createdAt }: { id: string; idempotencyKey?: string; createdAt: string },
): Promise<void> {
  await db.prepare(`INSERT INTO subscribers (id, email, source, status, subscribed_at, created_at, updated_at, idempotency_key)
    VALUES (?, ?, ?, 'subscribed', ?, ?, ?, ?)`)
    .bind(id, input.email, input.source, createdAt, createdAt, createdAt, idempotencyKey ?? null).run();
}

export async function reactivateSubscriber(db: D1Database, email: string, source: string, updatedAt: string): Promise<void> {
  await db.prepare(`UPDATE subscribers
    SET source = ?, status = 'subscribed', subscribed_at = ?, unsubscribed_at = NULL, updated_at = ?
    WHERE email = ?`).bind(source, updatedAt, updatedAt, email).run();
}
