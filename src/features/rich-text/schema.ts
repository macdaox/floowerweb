import sanitizeHtml from "sanitize-html";
import { mediaObjectKeyFromPublicUrl } from "../media/schemas";

const MAX_INPUT_LENGTH = 200_000;
const MAX_OUTPUT_LENGTH = 160_000;
const blockTagPattern = /^\s*<(?:p|h2|h3|ul|ol|blockquote|figure)(?:\s|>)/iu;

export function normalizeRichText(input: string): string {
  if (input.length > MAX_INPUT_LENGTH) {
    throw new Error("Rich text must contain no more than 200,000 characters.");
  }

  let output = sanitizeHtml(input, {
    allowedTags: ["p", "h2", "h3", "strong", "em", "a", "ul", "ol", "li", "blockquote", "br", "img", "figure", "figcaption"],
    allowedAttributes: {
      a: ["href", "target", "rel"],
      img: ["src", "alt", "data-media-id"],
    },
    allowedSchemes: ["https", "mailto"],
    allowProtocolRelative: false,
    transformTags: {
      a: (_tagName, attributes) => {
        const href = attributes.href;
        if (href?.startsWith("https://")) {
          return {
            tagName: "a",
            attribs: { ...attributes, target: "_blank", rel: "noopener noreferrer" },
          };
        }
        const { target: _target, rel: _rel, ...safeAttributes } = attributes;
        return { tagName: "a", attribs: safeAttributes };
      },
    },
    exclusiveFilter: (frame) => {
      if (frame.tag === "img") {
        const src = frame.attribs.src ?? "";
        const safeAsset = /^\/assets\/[a-zA-Z0-9._/-]+$/u.test(src)
          && !src.includes("..") && !src.includes("//") && !src.endsWith("/");
        return !mediaObjectKeyFromPublicUrl(src) && !safeAsset;
      }
      if (!["p", "h2", "h3", "blockquote", "figure", "figcaption"].includes(frame.tag)) return false;
      return frame.text.trim().length === 0 && !frame.mediaChildren.some((tag) => tag === "img" || tag === "br");
    },
  }).trim();

  if (output && !blockTagPattern.test(output) && !/^\s*<(?:img|ul|ol)(?:\s|>)/iu.test(output)) {
    output = `<p>${output}</p>`;
  }
  if (output.length > MAX_OUTPUT_LENGTH) {
    throw new Error("Rich text must contain no more than 160,000 sanitized characters.");
  }
  return output;
}

export function legacyTextToRichHtml(input: string): string {
  const escaped = escapeHtml(input.replace(/\r\n?/gu, "\n"));
  return escaped
    .split(/\n{2,}/u)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => `<p>${paragraph.replace(/\n/gu, "<br>")}</p>`)
    .join("");
}

export function richTextMediaObjectKeys(html: string): string[] {
  const keys = new Set<string>();
  const normalized = normalizeRichText(html);
  for (const match of normalized.matchAll(/<img\b[^>]*\bsrc=(?:"([^"]*)"|'([^']*)')[^>]*>/giu)) {
    const key = mediaObjectKeyFromPublicUrl(match[1] ?? match[2] ?? "");
    if (key) keys.add(key);
  }
  return [...keys];
}

export function richTextMediaImages(html: string): Array<{ objectKey: string; alt: string }> {
  const normalized = normalizeRichText(html);
  const images: Array<{ objectKey: string; alt: string }> = [];
  for (const match of normalized.matchAll(/<img\b[^>]*>/giu)) {
    const tag = match[0];
    const src = /\bsrc="([^"]*)"/iu.exec(tag)?.[1] ?? "";
    const objectKey = mediaObjectKeyFromPublicUrl(src);
    if (objectKey) images.push({ objectKey, alt: /\balt="([^"]*)"/iu.exec(tag)?.[1] ?? "" });
  }
  return images;
}

export function isEmptyRichText(html: string): boolean {
  const normalized = normalizeRichText(html);
  if (/<img\b/iu.test(normalized)) return false;
  const text = sanitizeHtml(normalized, { allowedTags: [], allowedAttributes: {} })
    .replace(/&nbsp;|\u00a0/gu, " ")
    .trim();
  return text.length === 0;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;")
    .replace(/'/gu, "&#39;");
}
