import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";
import type { AppDb } from "./types";

export function createDb(binding: D1Database): AppDb {
  return drizzle(binding, { schema });
}
