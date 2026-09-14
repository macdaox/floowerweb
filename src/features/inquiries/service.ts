import { HttpError } from "../../lib/http/errors";
import type { InquiryInput, SubscriberInput } from "./schemas";
import {
  findSubmissionKey,
  findSubscriberByEmail,
  insertInquiry,
  insertSubscriber,
  publishedProductExists,
  reactivateSubscriber,
  type SubmissionKeyRecord,
} from "./repository";

export interface SubmissionContext {
  idempotencyKey?: string;
  payloadHash?: string;
}

export async function createInquiry(
  db: D1Database,
  input: InquiryInput,
  context: SubmissionContext = {},
): Promise<{ id: string; status: "new" }> {
  const normalized = { ...input, interests: normalizeInterests(input.interests) };
  const existing = await existingSubmission(db, context, "inquiry");
  if (existing) return replayInquiry(existing);
  if (normalized.productId && !await publishedProductExists(db, normalized.productId)) {
    throw new HttpError("validation_failed", "Please correct the highlighted fields.", 422, { productId: "This product is no longer available." });
  }

  const id = crypto.randomUUID();
  try {
    await insertInquiry(db, normalized, { id, idempotencyKey: context.idempotencyKey, payloadHash: context.payloadHash, createdAt: new Date().toISOString() });
  } catch (error) {
    if (context.idempotencyKey) {
      const replay = await existingSubmission(db, context, "inquiry");
      if (replay) return replayInquiry(replay);
    }
    throw error;
  }
  return { id, status: "new" };
}

export async function subscribe(
  db: D1Database,
  input: SubscriberInput,
  context: SubmissionContext = {},
): Promise<{ subscribed: true }> {
  const replay = await existingSubmission(db, context, "subscriber");
  if (replay) return { subscribed: true };
  const now = new Date().toISOString();
  const existing = await findSubscriberByEmail(db, input.email);
  try {
    if (existing) {
      await reactivateSubscriber(db, existing.id, input.email, input.source, { idempotencyKey: context.idempotencyKey, payloadHash: context.payloadHash, updatedAt: now });
    } else {
      await insertSubscriber(db, input, { id: crypto.randomUUID(), idempotencyKey: context.idempotencyKey, payloadHash: context.payloadHash, createdAt: now });
    }
  } catch (error) {
    if (context.idempotencyKey && await existingSubmission(db, context, "subscriber")) return { subscribed: true };
    throw error;
  }
  return { subscribed: true };
}

export async function inquiryPayloadHash(input: InquiryInput): Promise<string> {
  return hash({ type: "inquiry", inquiryType: input.inquiryType, name: input.name, email: input.email, phone: input.phone ?? null,
    company: input.company ?? null, country: input.country ?? null, buyerType: input.buyerType ?? null,
    interests: normalizeInterests(input.interests), message: input.message ?? null, productId: input.productId ?? null, sourceRoute: input.sourceRoute });
}

export async function subscriberPayloadHash(input: SubscriberInput): Promise<string> {
  return hash({ type: "subscriber", email: input.email, source: input.source });
}

function normalizeInterests(interests: string[]): string[] {
  return [...new Set(interests.map((interest) => interest.trim()).filter(Boolean))];
}

async function existingSubmission(db: D1Database, context: SubmissionContext, type: SubmissionKeyRecord["submissionType"]): Promise<SubmissionKeyRecord | null> {
  if (!context.idempotencyKey) return null;
  const existing = await findSubmissionKey(db, context.idempotencyKey);
  if (!existing) return null;
  if (!context.payloadHash || existing.submissionType !== type || existing.payloadHash !== context.payloadHash) {
    throw new HttpError("idempotency_conflict", "This idempotency key was already used for a different submission.", 409);
  }
  return existing;
}

function replayInquiry(existing: SubmissionKeyRecord): { id: string; status: "new" } {
  if (!existing.inquiryId) throw new HttpError("idempotency_conflict", "This idempotency key was already used for a different submission.", 409);
  return { id: existing.inquiryId, status: "new" };
}

async function hash(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
