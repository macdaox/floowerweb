import { expect, test } from "@playwright/test";

test("critical public and admin routes survive a production build", async ({ request }) => {
  for (const route of ["/", "/collections", "/about", "/contact", "/wholesale", "/admin/login", "/health"]) {
    expect((await request.get(route)).status(), route).toBeLessThan(400);
  }
});
