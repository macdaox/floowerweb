/// <reference types="@cloudflare/workers-types" />

import type { AuthUser } from "./features/auth/authorize";

export interface RuntimeEnv {
  DB: D1Database;
  MEDIA: R2Bucket;
  SESSION_SECRET: string;
}

declare global {
  namespace App {
    interface Locals {
      runtime: {
        env: RuntimeEnv;
      };
      auth?: AuthUser;
    }
  }
}
