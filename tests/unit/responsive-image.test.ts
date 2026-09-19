import { describe, expect, it } from "vitest";
import { dynamicImageAttributes } from "../../src/features/media/responsive";

describe("dynamic responsive image attributes", () => {
  it("uses stored intrinsic dimensions and distinct Cloudflare resizing candidates when explicitly configured", () => {
    const attributes = dynamicImageAttributes(
      { src: "/media/flower.jpg", alt: "Flower", width: 900, height: 1124 },
      { resizingOrigin: "https://images.everstem.example", widths: [320, 640, 960] },
    );

    expect(attributes).toMatchObject({ width: 900, height: 1124 });
    expect(attributes.srcset?.split(", ")).toEqual([
      "https://images.everstem.example/cdn-cgi/image/width=320,fit=scale-down,format=auto/media/flower.jpg 320w",
      "https://images.everstem.example/cdn-cgi/image/width=640,fit=scale-down,format=auto/media/flower.jpg 640w",
      "https://images.everstem.example/cdn-cgi/image/width=900,fit=scale-down,format=auto/media/flower.jpg 900w",
    ]);
  });

  it("keeps the original source and omits srcset when optional resizing is not configured", () => {
    expect(dynamicImageAttributes(
      { src: "/media/flower.jpg", alt: "Flower", width: 900, height: 1124 },
      { widths: [320, 640] },
    )).toEqual({ src: "/media/flower.jpg", width: 900, height: 1124 });
  });

  it("rejects an unsafe resizing origin instead of emitting transform URLs", () => {
    expect(() => dynamicImageAttributes(
      { src: "/media/flower.jpg", alt: "Flower", width: 900, height: 1124 },
      { resizingOrigin: "javascript:alert(1)", widths: [320] },
    )).toThrow(/PUBLIC_IMAGE_RESIZING_ORIGIN/);
  });
});
