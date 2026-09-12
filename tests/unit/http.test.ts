import { describe, expect, it } from "vitest";
import { createDb } from "../../src/lib/db/client";
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
});

describe("fixed-window rate limits", () => {
  it("allows requests until the key reaches its limit", async () => {
    const db = createDb(new InMemoryD1() as unknown as D1Database);

    await expect(consumeRateLimit(db, "ip:form", 2, 60)).resolves.toBe(true);
    await expect(consumeRateLimit(db, "ip:form", 2, 60)).resolves.toBe(true);
    await expect(consumeRateLimit(db, "ip:form", 2, 60)).resolves.toBe(false);
  });

  it("rejects invalid limits before writing a counter", async () => {
    const db = createDb(new InMemoryD1() as unknown as D1Database);

    await expect(consumeRateLimit(db, "ip:form", 0, 60)).rejects.toMatchObject({ status: 500, code: "invalid_rate_limit" });
  });
});

function requestFrom(origin: string): Request {
  return new Request("https://everstem.test/api/contact", { method: "POST", headers: { origin } });
}

class InMemoryD1 {
  private readonly counters = new Map<string, { windowStart: number; count: number }>();

  prepare(query: string): InMemoryStatement {
    return new InMemoryStatement(query, this.counters);
  }
}

class InMemoryStatement {
  private values: unknown[] = [];

  constructor(
    private readonly query: string,
    private readonly counters: Map<string, { windowStart: number; count: number }>,
  ) {}

  bind(...values: unknown[]): this {
    this.values = values;
    return this;
  }

  async run(): Promise<D1Response> {
    return { success: true, meta: { changes: 0 } } as D1Response;
  }

  async all<T = Record<string, unknown>>(): Promise<D1Result<T>> {
    if (!this.query.includes("INSERT INTO rate_limits")) {
      return { success: true, results: [], meta: {} } as unknown as D1Result<T>;
    }

    const [key, windowStart] = this.values as [string, number];
    const current = this.counters.get(key);
    const count = !current || current.windowStart !== windowStart ? 1 : current.count + 1;
    this.counters.set(key, { windowStart, count });
    return { success: true, results: [{ count } as T], meta: {} } as unknown as D1Result<T>;
  }
}
