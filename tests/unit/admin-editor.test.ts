import { describe, expect, it } from "vitest";
import { appendPageMediaBlock } from "../../src/components/admin/editor";

describe("admin content editor media reuse", () => {
  it("adds a selected library item to page sections without requiring a hand-written media path", () => {
    expect(appendPageMediaBlock([{ type: "hero", title: "Home" }], {
      id: "media-1", objectKey: "00000000-0000-4000-8000-000000000811.jpg", originalFilename: "magnolia.jpg",
      mimeType: "image/jpeg", byteSize: 10, altText: "White magnolia branch", url: "/media/00000000-0000-4000-8000-000000000811.jpg",
    })).toEqual([
      { type: "hero", title: "Home" },
      { type: "imageText", title: "New image section", body: "Add section copy.", image: { src: "/media/00000000-0000-4000-8000-000000000811.jpg", alt: "White magnolia branch" } },
    ]);
  });
});
