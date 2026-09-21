// workerd rejects PBKDF2 derivations above 100,000 iterations.
const PBKDF2_ITERATIONS = 100_000;
const SALT_BYTES = 16;
const DERIVED_KEY_BYTES = 32;
const PASSWORD_HASH_PREFIX = "pbkdf2-sha256";
const encoder = new TextEncoder();

/** Hash a password using the Worker-compatible PBKDF2 parameters used by Everstem. */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const derived = await derive(password, salt, PBKDF2_ITERATIONS);
  return [PASSWORD_HASH_PREFIX, PBKDF2_ITERATIONS, toBase64Url(salt), toBase64Url(derived)].join("$");
}

/** Verify an encoded PBKDF2 password hash without leaking matching-byte position. */
export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const parsed = parsePasswordHash(encoded);
  if (!parsed) return false;

  const actual = await derive(password, parsed.salt, parsed.iterations);
  return constantTimeEqual(actual, parsed.derived);
}

function parsePasswordHash(encoded: string): { iterations: number; salt: Uint8Array; derived: Uint8Array } | undefined {
  const [prefix, iterationText, saltText, derivedText, ...extra] = encoded.split("$");
  if (prefix !== PASSWORD_HASH_PREFIX || extra.length > 0) return undefined;

  const iterations = Number(iterationText);
  if (iterations !== PBKDF2_ITERATIONS) return undefined;

  try {
    const salt = fromBase64Url(saltText ?? "");
    const derived = fromBase64Url(derivedText ?? "");
    if (salt.byteLength !== SALT_BYTES || derived.byteLength !== DERIVED_KEY_BYTES) return undefined;
    return { iterations, salt, derived };
  } catch {
    return undefined;
  }
}

async function derive(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const material = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    material,
    DERIVED_KEY_BYTES * 8,
  );
  return new Uint8Array(bits);
}

function constantTimeEqual(left: Uint8Array, right: Uint8Array): boolean {
  let difference = left.byteLength ^ right.byteLength;
  const length = Math.max(left.byteLength, right.byteLength);
  for (let index = 0; index < length; index += 1) {
    difference |= (left[index] ?? 0) ^ (right[index] ?? 0);
  }
  return difference === 0;
}

function toBase64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

function fromBase64Url(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/u.test(value)) throw new Error("Invalid base64url");
  const padded = value.replaceAll("-", "+").replaceAll("_", "/") + "=".repeat((4 - (value.length % 4)) % 4);
  return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
}
