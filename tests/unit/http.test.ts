import { describe, expect, it } from "vitest";
import type { AppDb } from "../../src/lib/db/types";
import { HttpError } from "../../src/lib/http/errors";
import { assertAllowedOrigin } from "../../src/lib/http/origin";
import { consumeRateLimit } from "../../src/lib/http/rate-limit";
import { parseForm, parseJson } from "../../src/lib/http/request";
import { fail, ok } from "../../src/lib/http/result";

describe("HTTP response contracts", () => {
  it("wraps successful payloads in the public envelope", async () => {
    const response = ok({ id: "1" }, 201);

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ ok: true, data: { id: "1" } });
  });

  it("returns a field-aware error envelope without empty fields", async () => {
    expect(await fail("invalid_input", "Please correct the form.", 422, { email: "Enter a valid email." }).json()).toEqual({
      ok: false,
      error: {
        code: "invalid_input",
        message: "Please correct the form.",
        fields: { email: "Enter a valid email." },
      },
    });
    expect(await fail("not_found", "Not found.", 404).json()).toEqual({
      ok: false,
      error: { code: "not_found", message: "Not found." },
    });
  });
});

describe("same-origin mutation protection", () => {
  it("rejects a mutation from another origin", () => {
    expect(() => assertAllowedOrigin(requestFrom("https://evil.test"), "https://everstem.test"))
      .toThrowError(HttpError);
  });

  it("accepts requests from the configured origin", () => {
    expect(() => assertAllowedOrigin(requestFrom("https://everstem.test"), "https://everstem.test"))
      .not.toThrow();
  });

  it("rejects a mutation with no origin", () => {
    expect(() => assertAllowedOrigin(new Request("https://everstem.test/api/contact", { method: "POST" }), "https://everstem.test"))
      .toThrowError(HttpError);
  });
});

describe("bounded request parsing", () => {
  it("parses JSON only within the declared byte limit", async () => {
    const request = new Request("https://everstem.test/api/contact", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "hello" }),
    });

    await expect(parseJson<{ message: string }>(request, 64)).resolves.toEqual({ message: "hello" });
    await expect(parseJson(new Request("https://everstem.test/api/contact", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "this exceeds the small request limit" }),
    }), 8)).rejects.toMatchObject({ status: 413, code: "body_too_large" });
  });

  it("parses URL-encoded forms only within the declared byte limit", async () => {
    const request = new Request("https://everstem.test/api/contact", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: "name=Ava&company=Everstem",
    });

    const form = await parseForm(request, 64);
    expect(Object.fromEntries(form)).toEqual({ name: "Ava", company: "Everstem" });
  });

  it("rejects malformed JSON as a client error", async () => {
    const request = new Request("https://everstem.test/api/contact", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{",
    });

    await expect(parseJson(request, 64)).rejects.toMatchObject({ status: 400, code: "invalid_json" });
  });

  it("cancels a chunked body as soon as the byte limit is exceeded", async () => {
    let cancelled = false;
    const encoder = new TextEncoder();
    let chunk = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (chunk === 0) {
          chunk += 1;
          controller.enqueue(encoder.encode('{"message":"'));
        } else if (chunk === 1) {
          chunk += 1;
          controller.enqueue(encoder.encode("this is too large"));
        } else {
          controller.close();
        }
      },
      cancel() {
        cancelled = true;
      },
    });
    const request = new Request("https://everstem.test/api/contact", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      duplex: "half",
    } as RequestInit);

    expect(request.headers.get("content-length")).toBeNull();
    await expect(parseJson(request, 16)).rejects.toMatchObject({ status: 413, code: "body_too_large" });
    expect(cancelled).toBe(true);
  });
});

describe("fixed-window rate limits", () => {
  it("rejects invalid limits before writing a counter", async () => {
    await expect(consumeRateLimit({} as AppDb, "ip:form", 0, 60)).rejects.toMatchObject({ status: 500, code: "invalid_rate_limit" });
  });
});

function requestFrom(origin: string): Request {
  return new Request("https://everstem.test/api/contact", { method: "POST", headers: { origin } });
}
