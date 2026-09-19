import { HttpError } from "../../lib/http/errors";
import { findMediaReferences, getMedia, insertMedia, markMediaDeleted } from "./repository";
import type { MediaMimeType, MediaRecord } from "./schemas";

const DEFAULT_MAX_BYTES = 10 * 1024 * 1024;
const MAX_CONFIGURED_BYTES = 50 * 1024 * 1024;

export type MediaEnvironment = {
  DB: D1Database;
  MEDIA: R2Bucket;
  MEDIA_MAX_BYTES?: string;
};

export type UploadMediaInput = {
  altText?: string | null;
  createdByUserId: string;
};

export function mediaByteLimit(env: Pick<MediaEnvironment, "MEDIA_MAX_BYTES">): number {
  if (!env.MEDIA_MAX_BYTES) return DEFAULT_MAX_BYTES;
  const value = Number(env.MEDIA_MAX_BYTES);
  if (!Number.isSafeInteger(value) || value < 1 || value > MAX_CONFIGURED_BYTES) {
    throw new HttpError("media_configuration", "Media upload limits are not configured correctly.", 500);
  }
  return value;
}

export async function uploadMedia(env: MediaEnvironment, file: File, input: UploadMediaInput): Promise<MediaRecord> {
  const limit = mediaByteLimit(env);
  if (file.size > limit) throw new HttpError("body_too_large", "Image exceeds the configured upload limit.", 413);
  if (file.size === 0) throw unsupported();
  const bytes = new Uint8Array(await file.arrayBuffer());
  const detected = detectImageType(bytes);
  const extension = filenameExtension(file.name);
  if (!detected || file.type.toLowerCase() !== detected.mimeType || extension !== detected.extension) throw unsupported();

  const id = crypto.randomUUID();
  const objectKey = `${crypto.randomUUID()}.${detected.extension}`;
  const now = new Date().toISOString();
  const originalFilename = safeFilename(file.name);
  await env.MEDIA.put(objectKey, bytes, {
    httpMetadata: { contentType: detected.mimeType },
    customMetadata: { originalFilename },
  });
  try {
    return await insertMedia(env.DB, {
      id,
      objectKey,
      originalFilename,
      mimeType: detected.mimeType,
      byteSize: bytes.byteLength,
      width: null,
      height: null,
      altText: input.altText?.trim() || null,
      createdAt: now,
      updatedAt: now,
    }, input.createdByUserId);
  } catch (error) {
    try { await env.MEDIA.delete(objectKey); } catch (cleanupError) { console.error("Unable to compensate failed media index write", cleanupError); }
    console.error("Unable to index uploaded media", error);
    throw new HttpError("media_index_failed", "Unable to index the uploaded image. Please retry.", 500);
  }
}

export async function deleteMedia(env: MediaEnvironment, id: string, actorUserId?: string): Promise<{ deleted: true }> {
  const record = await getMedia(env.DB, id);
  const references = await findMediaReferences(env.DB, id);
  if (references.length > 0) {
    throw new HttpError("media_referenced", "This image is referenced by content and cannot be deleted.", 409, { media: "Remove it from content and galleries first." });
  }
  const object = await env.MEDIA.get(record.objectKey);
  const backup = object ? await object.arrayBuffer() : null;
  await env.MEDIA.delete(record.objectKey);
  const timestamp = new Date().toISOString();
  try {
    await markMediaDeleted(env.DB, id, timestamp, actorUserId);
  } catch (error) {
    if (backup) {
      try {
        await env.MEDIA.put(record.objectKey, backup, { httpMetadata: object?.httpMetadata, customMetadata: object?.customMetadata });
      } catch (restoreError) {
        console.error("Unable to compensate failed media deletion index write", restoreError);
      }
    }
    throw error;
  }
  return { deleted: true };
}

type DetectedImage = { mimeType: MediaMimeType; extension: "jpg" | "png" | "webp" | "avif" };

function detectImageType(bytes: Uint8Array): DetectedImage | null {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return { mimeType: "image/jpeg", extension: "jpg" };
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { mimeType: "image/png", extension: "png" };
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP") return { mimeType: "image/webp", extension: "webp" };
  if (ascii(bytes, 4, 4) === "ftyp") {
    for (let offset = 8; offset + 4 <= Math.min(bytes.length, 32); offset += 4) {
      if (["avif", "avis"].includes(ascii(bytes, offset, 4))) return { mimeType: "image/avif", extension: "avif" };
    }
  }
  return null;
}

function startsWith(bytes: Uint8Array, signature: number[]): boolean {
  return bytes.length >= signature.length && signature.every((value, index) => bytes[index] === value);
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  if (bytes.length < offset + length) return "";
  return String.fromCharCode(...bytes.slice(offset, offset + length));
}

function filenameExtension(name: string): string {
  const match = /\.([a-z0-9]+)$/iu.exec(name);
  return match?.[1]?.toLowerCase() === "jpeg" ? "jpg" : match?.[1]?.toLowerCase() ?? "";
}

function safeFilename(name: string): string {
  const leaf = name.replaceAll("\\", "/").split("/").pop()?.trim() ?? "";
  return leaf.slice(0, 255) || "image";
}

function unsupported(): HttpError {
  return new HttpError("unsupported_media_type", "Upload a JPG, PNG, WebP, or AVIF image whose bytes match its file type.", 415, { file: "Choose a valid JPG, PNG, WebP, or AVIF image." });
}
