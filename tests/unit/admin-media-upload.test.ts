import { afterEach, describe, expect, it, vi } from "vitest";
import { MediaUploadError, uploadAdminImage } from "../../src/components/admin/media-upload";

const item = {
  id: "00000000-0000-4000-8000-000000000001",
  objectKey: "00000000-0000-4000-8000-000000000000.webp",
  originalFilename: "fern.webp",
  mimeType: "image/webp",
  byteSize: 42,
  altText: "Green preserved fern",
  url: "/media/00000000-0000-4000-8000-000000000000.webp",
};

afterEach(() => vi.unstubAllGlobals());

describe("uploadAdminImage", () => {
  it("posts multipart data and returns the uploaded media item", async () => {
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      expect(init.method).toBe("POST");
      expect(init.body).toBeInstanceOf(FormData);
      expect((init.body as FormData).get("altText")).toBe("Green preserved fern");
      expect((init.body as FormData).get("file")).toBeInstanceOf(File);
      return new Response(JSON.stringify({ ok: true, data: item }), { status: 201 });
    });
    vi.stubGlobal("fetch", fetchMock);
    await expect(uploadAdminImage(new File(["image"], "fern.webp", { type: "image/webp" }), "Green preserved fern"))
      .resolves.toEqual(item);
  });

  it("maps validation fields to a typed upload error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      ok: false,
      error: { code: "invalid_payload", message: "Please correct the request payload.", fields: { file: "Choose an image." } },
    }), { status: 422 })));
    const error = await uploadAdminImage(new File(["x"], "x.txt"), "").catch((caught) => caught);
    expect(error).toBeInstanceOf(MediaUploadError);
    expect(error).toMatchObject({ status: 422, code: "invalid_payload", fields: { file: "Choose an image." } });
  });

  it("propagates abort errors unchanged", async () => {
    const aborted = new DOMException("Stopped", "AbortError");
    vi.stubGlobal("fetch", vi.fn(async () => { throw aborted; }));
    await expect(uploadAdminImage(new File(["x"], "fern.webp"), "", new AbortController().signal)).rejects.toBe(aborted);
  });
});
