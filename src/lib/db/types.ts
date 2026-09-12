import type { DrizzleD1Database } from "drizzle-orm/d1";
import type * as schema from "./schema";

export type AppDb = DrizzleD1Database<typeof schema>;
export type ContentStatus = (typeof import("./schema").contentStatuses)[number];
export type InquiryStatus = (typeof import("./schema").inquiryStatuses)[number];
export type InquiryType = (typeof import("./schema").inquiryTypes)[number];
export type Role = (typeof import("./schema").userRoles)[number];
