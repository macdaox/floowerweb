export type PreviewKind = "product" | "category" | "space" | "article" | "page";

export type PreviewClaims = {
  version: 1;
  kind: PreviewKind;
  id: string;
  expiresAt: number;
};

const DEFAULT_TTL_SECONDS = 5 * 60;
const LOCAL_DEVELOPMENT_SECRET = "everstem-local-preview-signing-key-not-for-production";

export function resolvePreviewSecret(value: string | undefined): string | null {
  if (value?.trim()) return value;
  return import.meta.env.DEV ? LOCAL_DEVELOPMENT_SECRET : null;
}

export async function issuePreviewToken(
  identity: { kind: PreviewKind; id: string },
  secret: string,
  now = Date.now(),
  ttlSeconds = DEFAULT_TTL_SECONDS,
): Promise<string> {
  const claims: PreviewClaims = {
    version: 1,
    kind: identity.kind,
    id: identity.id,
    expiresAt: Math.floor(now / 1_000) + ttlSeconds,
  };
  const payload = encodeBytes(new TextEncoder().encode(JSON.stringify(claims)));
  return `${payload}.${await sign(payload, secret)}`;
}

export async function verifyPreviewToken(
  token: string,
  secret: string,
  expectedKind: PreviewKind,
  expectedId?: string,
  now = Date.now(),
): Promise<PreviewClaims | null> {
  try {
    const parts = token.split(".");
    if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
    const key = await signingKey(secret, ["verify"]);
    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      decodeBytes(parts[1]),
      new TextEncoder().encode(parts[0]),
    );
    if (!valid) return null;
    const value: unknown = JSON.parse(new TextDecoder().decode(decodeBytes(parts[0])));
    if (!isClaims(value)) return null;
    if (value.kind !== expectedKind || (expectedId !== undefined && value.id !== expectedId) || value.expiresAt <= Math.floor(now / 1_000)) return null;
    return value;
  } catch {
    return null;
  }
}

async function sign(payload: string, secret: string): Promise<string> {
  const key = await signingKey(secret, ["sign"]);
  return encodeBytes(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload))));
}

function signingKey(secret: string, usages: KeyUsage[]): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, usages);
}

function isClaims(value: unknown): value is PreviewClaims {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const claims = value as Record<string, unknown>;
  return claims.version === 1
    && ["product", "category", "space", "article", "page"].includes(String(claims.kind))
    && typeof claims.id === "string"
    && Boolean(claims.id)
    && Number.isSafeInteger(claims.expiresAt);
}

function encodeBytes(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

function decodeBytes(value: string): Uint8Array {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
  return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
}
