import { describe, expect, it } from "vitest";
import { contentImageFromRow, parsePageBlocks } from "../../src/features/content/schemas";

describe("page block validation", () => {
  it("rejects an unknown block type at the content boundary", () => {
    expect(() => parsePageBlocks([{ type: "unsafeEmbed", url: "https://example.test" }])).toThrow(/unknown page block type/i);
  });

  it("limits rich text to text paragraphs", () => {
    expect(() => parsePageBlocks([{ type: "richText", document: { type: "doc", content: [{ type: "image", src: "javascript:alert(1)" }] } }])).toThrow(/rich text/i);
  });

  it("does not turn an unsafe media filename into a public asset URL", () => {
    expect(contentImageFromRow({ original_filename: "../private.png" })).toBeUndefined();
  });

  it("accepts immutable R2 media paths in page blocks and rejects unsafe media paths", () => {
    const src = "/media/00000000-0000-4000-8000-000000000321.jpg";
    expect(parsePageBlocks([{ type: "hero", title: "R2 hero", image: { src, alt: "White magnolia branch" } }]))
      .toEqual([expect.objectContaining({ image: { src, alt: "White magnolia branch" } })]);
    expect(() => parsePageBlocks([{ type: "hero", title: "Unsafe", image: { src: "/media/../private.jpg", alt: "Private file" } }])).toThrow(/content image/i);
  });
});
