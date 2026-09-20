import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:4322",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium-production", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "wrangler pages dev ./dist --ip 127.0.0.1 --port 4322 --binding SESSION_SECRET=production-smoke-secret-32-bytes --binding PUBLIC_SITE_URL=https://everstem.test",
    url: "http://127.0.0.1:4322/health",
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
