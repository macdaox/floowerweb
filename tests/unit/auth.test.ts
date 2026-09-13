import { describe, expect, it } from "vitest";
import { requireRole } from "../../src/features/auth/authorize";
import { hashPassword, verifyPassword } from "../../src/features/auth/password";

describe("password hashing", () => {
  it("verifies the original password without retaining plaintext", async () => {
    const encoded = await hashPassword("correct horse battery staple");
    const [algorithm, iterations, salt, derived] = encoded.split("$");

    expect(encoded).not.toContain("correct horse");
    expect([algorithm, iterations]).toEqual(["pbkdf2-sha256", "600000"]);
    expect(Buffer.from(salt, "base64url")).toHaveLength(16);
    expect(Buffer.from(derived, "base64url")).toHaveLength(32);
    await expect(verifyPassword("correct horse battery staple", encoded)).resolves.toBe(true);
    await expect(verifyPassword("wrong password", encoded)).resolves.toBe(false);
  });

  it("rejects malformed stored hashes without throwing", async () => {
    await expect(verifyPassword("correct horse battery staple", "not-a-password-hash")).resolves.toBe(false);
  });
});

describe("role authorization", () => {
  it("rejects an authenticated user whose role is not allowed", () => {
    const editorLocals = {
      auth: { id: "editor-1", email: "editor@example.com", displayName: "Editor", role: "editor" as const },
    };

    expect(() => requireRole(editorLocals, ["admin"])).toThrowError(expect.objectContaining({ status: 403 }));
  });

  it("rejects a request without an authenticated user", () => {
    expect(() => requireRole({}, ["admin"])).toThrowError(expect.objectContaining({ status: 401 }));
  });
});
