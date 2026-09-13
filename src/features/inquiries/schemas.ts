import { z } from "zod";
import { HttpError } from "../../lib/http/errors";

const route = z.string().trim().regex(/^\/(?:[a-z0-9][a-z0-9/_-]*)?$/i, "Enter a valid site route.").max(200);
const optionalText = (max: number) => z.string().trim().max(max).optional().transform((value) => value || undefined);
const email = z.string().trim().toLowerCase().email("Enter a valid email address.").max(254);

const inquiryBase = z.object({
  inquiryType: z.enum(["product", "contact", "catalog"]),
  name: z.string().trim().min(2, "Enter your name.").max(120),
  email,
  phone: optionalText(60),
  company: optionalText(120),
  country: optionalText(120),
  buyerType: optionalText(80),
  interests: z.array(z.string().trim().min(1).max(120)).max(8).default([]),
  message: optionalText(2_000),
  productId: optionalText(100),
  sourceRoute: route,
  website: z.string().max(200).optional(),
}).strict();

export const inquiryInputSchema = inquiryBase.superRefine((input, context) => {
  if (input.inquiryType === "product" && !input.productId) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["productId"], message: "Choose a product before sending an inquiry." });
  }
  if (input.inquiryType === "catalog") {
    for (const field of ["company", "country", "buyerType"] as const) {
      if (!input[field]) context.addIssue({ code: z.ZodIssueCode.custom, path: [field], message: "This field is required for catalog requests." });
    }
    if (input.interests.length === 0) context.addIssue({ code: z.ZodIssueCode.custom, path: ["interests"], message: "Choose at least one product interest." });
  }
});

export const subscriberInputSchema = z.object({
  email,
  source: route,
  website: z.string().max(200).optional(),
}).strict();

export const idempotencyKeySchema = z.string().trim().min(16).max(128).regex(/^[A-Za-z0-9_-]+$/, "Use a valid idempotency key.");

export type InquiryInput = z.infer<typeof inquiryInputSchema>;
export type SubscriberInput = z.infer<typeof subscriberInputSchema>;

export function parseInquiryInput(value: unknown): InquiryInput {
  return parse(inquiryInputSchema, value) as InquiryInput;
}

export function parseSubscriberInput(value: unknown): SubscriberInput {
  return parse(subscriberInputSchema, value);
}

export function parseIdempotencyKey(value: string | null): string | undefined {
  if (!value) return undefined;
  return parse(idempotencyKeySchema, value);
}

export function isHoneypotSubmission(value: unknown): boolean {
  return typeof value === "object" && value !== null && "website" in value && typeof value.website === "string" && value.website.trim().length > 0;
}

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  const fields: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const field = String(issue.path[0] ?? "form");
    fields[field] ??= issue.message;
  }
  throw new HttpError("validation_failed", "Please correct the highlighted fields.", 422, fields);
}
