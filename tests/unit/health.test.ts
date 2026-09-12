import { describe, expect, it } from "vitest";
import { GET } from "../../src/pages/health";

describe("GET /health", () => {
  it("reports the service as healthy", async () => {
    const response = await GET({} as never);
    expect(await response.json()).toEqual({ ok: true, service: "everstem" });
  });
});
