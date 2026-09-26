import { describe, expect, it } from "vitest";
import {
  isEmptyRichText,
  legacyTextToRichHtml,
  normalizeRichText,
  richTextMediaObjectKeys,
} from "../../src/features/rich-text/schema";

describe("rich text contract", () => {
  it("removes scripts and unsafe attributes", () => {
    expect(normalizeRichText('<h2 onclick="x()">Hello</h2><script>alert(1)</script>'))
      .toBe("<h2>Hello</h2>");
  });

  it("removes unsafe links and wraps top-level inline content", () => {
    expect(normalizeRichText('<a href="javascript:alert(1)">bad</a>'))
      .toBe("<p><a>bad</a></p>");
  });

  it("preserves supported images and alternative text", () => {
    expect(normalizeRichText('<img src="/media/00000000-0000-4000-8000-000000000000.webp" alt="Green preserved fern">'))
      .toContain('alt="Green preserved fern"');
  });

  it("drops image nodes with external or unsafe source paths", () => {
    expect(normalizeRichText('<p>Safe</p><img src="https://tracker.example/collect" alt="Tracker"><img src="/media/../private.jpg" alt="Private"><img src="/assets/../private.jpg" alt="Private"><img src="/assets//private.jpg" alt="Private">'))
      .toBe("<p>Safe</p>");
  });

  it("forces safe attributes on external links", () => {
    expect(normalizeRichText('<p><a href="https://example.com">Example</a></p>'))
      .toBe('<p><a href="https://example.com" target="_blank" rel="noopener noreferrer">Example</a></p>');
  });

  it("allows root-relative links but does not force a new tab", () => {
    expect(normalizeRichText('<p><a href="/collections">Collections</a></p>'))
      .toBe('<p><a href="/collections">Collections</a></p>');
  });

  it("extracts unique immutable media keys", () => {
    const html = '<p>Intro</p><img src="/media/00000000-0000-4000-8000-000000000000.webp"><img src="/media/00000000-0000-4000-8000-000000000000.webp">';
    expect(richTextMediaObjectKeys(html)).toEqual(["00000000-0000-4000-8000-000000000000.webp"]);
  });

  it("converts escaped legacy paragraphs", () => {
    expect(legacyTextToRichHtml("First\n\nSecond")).toBe("<p>First</p><p>Second</p>");
    expect(legacyTextToRichHtml('<b>unsafe</b>\nnext')).toBe("<p>&lt;b&gt;unsafe&lt;/b&gt;<br>next</p>");
  });

  it("recognizes empty and image-only content", () => {
    expect(isEmptyRichText("<p><br></p>" )).toBe(true);
    expect(isEmptyRichText('<p>&nbsp;</p><img src="/media/00000000-0000-4000-8000-000000000000.webp">')).toBe(false);
  });

  it("rejects oversized input and output", () => {
    expect(() => normalizeRichText("x".repeat(200_001))).toThrow(/200,000/);
    expect(() => normalizeRichText(`<p>${"x".repeat(160_001)}</p>`)).toThrow(/160,000/);
  });
});
