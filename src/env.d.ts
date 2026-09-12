/// <reference types="@cloudflare/workers-types" />

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
    }
  }
}
