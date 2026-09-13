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
});
