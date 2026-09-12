import { HttpError } from "./errors";

export async function parseJson<T>(request: Request, maxBytes: number): Promise<T> {
  const bytes = await readBody(request, maxBytes);

  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as T;
  } catch {
    throw new HttpError("invalid_json", "Request body must contain valid JSON.", 400);
  }
}

export async function parseForm(request: Request, maxBytes: number): Promise<FormData> {
  const contentType = request.headers.get("content-type");
  if (!contentType || !/^(application\/x-www-form-urlencoded|multipart\/form-data)(?:;|$)/i.test(contentType)) {
    throw new HttpError("unsupported_media_type", "Request body must be form data.", 415);
  }

  const bytes = await readBody(request, maxBytes);
  try {
    return await new Response(bytes, { headers: { "content-type": contentType } }).formData();
  } catch {
    throw new HttpError("invalid_form", "Request body must contain valid form data.", 400);
  }
}

async function readBody(request: Request, maxBytes: number): Promise<Uint8Array> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) {
    throw new HttpError("invalid_body_limit", "Request body limit must be a positive integer.", 500);
  }

  const declaredLength = request.headers.get("content-length");
  if (declaredLength && Number(declaredLength) > maxBytes) {
    throw bodyTooLarge();
  }

  if (!request.body) {
    return new Uint8Array();
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        try {
          await reader.cancel();
        } catch {
          // The body has already exceeded its safe limit; preserve the 413 response.
        }
        throw bodyTooLarge();
      }

      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

function bodyTooLarge(): HttpError {
  return new HttpError("body_too_large", "Request body exceeds the allowed size.", 413);
}
