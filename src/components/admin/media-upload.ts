import type { MediaItem } from "./MediaPicker";

export class MediaUploadError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
    readonly fields?: Record<string, string>,
  ) {
    super(message);
    this.name = "MediaUploadError";
  }
}

export async function uploadAdminImage(file: File, altText: string, signal?: AbortSignal): Promise<MediaItem> {
  const data = new FormData();
  data.set("file", file);
  data.set("altText", altText);
  const response = await fetch("/api/admin/media", {
    method: "POST",
    body: data,
    headers: { accept: "application/json" },
    signal,
  });
  const body = await response.json() as {
    ok: boolean;
    data?: MediaItem;
    error?: { code?: string; message?: string; fields?: Record<string, string> };
  };
  if (!response.ok || !body.ok || !body.data) {
    const message = body.error?.code === "unsupported_media_type"
      ? "仅支持有效的 JPG、PNG、WebP 或 AVIF 图片。"
      : body.error?.fields?.file ?? body.error?.message ?? "上传失败，请重试。";
    throw new MediaUploadError(message, response.status, body.error?.code, body.error?.fields);
  }
  return body.data;
}
