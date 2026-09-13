import { HttpError } from "../../lib/http/errors";
import type { InquiryInput, SubscriberInput } from "./schemas";
import {
  findInquiryByIdempotencyKey,
  findSubscriberByEmail,
  findSubscriberByIdempotencyKey,
  insertInquiry,
  insertSubscriber,
  publishedProductExists,
  reactivateSubscriber,
} from "./repository";

export async function createInquiry(
  db: D1Database,
  input: InquiryInput,
  context: { idempotencyKey?: string } = {},
): Promise<{ id: string; status: "new" }> {
  if (context.idempotencyKey) {
    const existing = await findInquiryByIdempotencyKey(db, context.idempotencyKey);
    if (existing) return existing;
  }
  if (input.productId && !await publishedProductExists(db, input.productId)) {
    throw new HttpError("validation_failed", "Please correct the highlighted fields.", 422, { productId: "This product is no longer available." });
  }

  const id = crypto.randomUUID();
  try {
    await insertInquiry(db, input, { id, idempotencyKey: context.idempotencyKey, createdAt: new Date().toISOString() });
  } catch (error) {
    if (context.idempotencyKey && isUniqueConstraint(error)) {
      const existing = await findInquiryByIdempotencyKey(db, context.idempotencyKey);
      if (existing) return existing;
    }
    throw error;
  }
  return { id, status: "new" };
}

export async function subscribe(
  db: D1Database,
  input: SubscriberInput,
  context: { idempotencyKey?: string } = {},
): Promise<{ subscribed: true }> {
  if (context.idempotencyKey && await findSubscriberByIdempotencyKey(db, context.idempotencyKey)) return { subscribed: true };
  const now = new Date().toISOString();
  const existing = await findSubscriberByEmail(db, input.email);
  if (existing) {
    await reactivateSubscriber(db, input.email, input.source, now);
    return { subscribed: true };
  }
  try {
    await insertSubscriber(db, input, { id: crypto.randomUUID(), idempotencyKey: context.idempotencyKey, createdAt: now });
  } catch (error) {
    if (isUniqueConstraint(error)) return { subscribed: true };
    throw error;
  }
  return { subscribed: true };
}

function isUniqueConstraint(error: unknown): boolean {
  return error instanceof Error && /unique constraint/i.test(error.message);
}
