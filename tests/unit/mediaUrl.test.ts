import { describe, expect, it } from "vitest";
import {
  isRawMomentMediaPath,
  isVideoMedia,
  isVideoMediaUrl,
  resolvePublicMediaUrl,
} from "../../src/lib/mediaUrl";

describe("resolvePublicMediaUrl", () => {
  const base = "https://events.example.com/";

  it("returns an empty string for missing media paths", () => {
    expect(resolvePublicMediaUrl("", base)).toBe("");
    expect(resolvePublicMediaUrl(null, base)).toBe("");
    expect(resolvePublicMediaUrl(undefined, base)).toBe("");
  });

  it("returns absolute URLs unchanged", () => {
    expect(
      resolvePublicMediaUrl("http://cdn.example.com/photo.jpg", base),
    ).toBe("http://cdn.example.com/photo.jpg");
    expect(
      resolvePublicMediaUrl("https://cdn.example.com/photo.jpg", base),
    ).toBe("https://cdn.example.com/photo.jpg");
    expect(resolvePublicMediaUrl("blob:https://app.example/id", base)).toBe(
      "blob:https://app.example/id",
    );
    expect(resolvePublicMediaUrl("data:image/webp;base64,AAAA", base)).toBe(
      "data:image/webp;base64,AAAA",
    );
  });

  it("returns protocol-relative CDN URLs unchanged", () => {
    expect(resolvePublicMediaUrl("//cdn.example.com/photo.jpg", base)).toBe(
      "//cdn.example.com/photo.jpg",
    );
  });

  it("prepends the public storage route to raw backend keys", () => {
    expect(resolvePublicMediaUrl("events/abc/photo.jpg", base)).toBe(
      "https://events.example.com/storage/events/abc/photo.jpg",
    );
  });

  it("does not duplicate the storage route when the API already returns it", () => {
    expect(resolvePublicMediaUrl("/storage/events/abc/photo.jpg", base)).toBe(
      "https://events.example.com/storage/events/abc/photo.jpg",
    );
  });

  it("normalizes a base URL without a trailing slash", () => {
    expect(resolvePublicMediaUrl("img.png", "https://api.example.com")).toBe(
      "https://api.example.com/storage/img.png",
    );
  });

  it("does not keep /api in backend media URLs", () => {
    expect(
      resolvePublicMediaUrl("img.png", "https://api.example.com/api"),
    ).toBe("https://api.example.com/storage/img.png");
  });

  it("preserves backend deployment subpaths before storage media URLs", () => {
    expect(
      resolvePublicMediaUrl(
        "events/abc/photo.jpg",
        "https://staging.example.com/eventi-api/api",
      ),
    ).toBe(
      "https://staging.example.com/eventi-api/storage/events/abc/photo.jpg",
    );
  });
});

describe("isVideoMediaUrl", () => {
  it("recognizes video URLs and raw keys", () => {
    expect(isVideoMediaUrl("https://cdn.example.com/clip.mp4")).toBe(true);
    expect(
      isVideoMediaUrl(
        "https://cdn.example.com/moments/event/raw/clip.mp4?X-Amz-Signature=fake",
      ),
    ).toBe(true);
    expect(isVideoMediaUrl("clip.webm")).toBe(true);
    expect(isVideoMediaUrl("clip.MOV?token=abc")).toBe(true);
    expect(isVideoMediaUrl("clip.m4v#poster")).toBe(true);
    expect(isVideoMediaUrl("clip.3gp?token=abc")).toBe(true);
    expect(isVideoMediaUrl("clip.avi?token=abc")).toBe(true);
    expect(isVideoMediaUrl("moments/event/raw/clip.mkv")).toBe(true);
  });

  it("returns false for image URLs", () => {
    expect(isVideoMediaUrl("https://cdn.example.com/photo.jpg")).toBe(false);
    expect(isVideoMediaUrl("photo.webp")).toBe(false);
  });
});

describe("isVideoMedia", () => {
  it("prefers backend content_type when present", () => {
    expect(
      isVideoMedia("moments/event/media-without-extension", "video/mp4"),
    ).toBe(true);
    expect(isVideoMedia("moments/event/photo.jpg", "video/quicktime")).toBe(
      true,
    );
  });

  it("falls back to media extension when content_type is absent", () => {
    expect(isVideoMedia("moments/event/clip.webm")).toBe(true);
    expect(isVideoMedia("moments/event/photo.webp")).toBe(false);
  });
});

describe("isRawMomentMediaPath", () => {
  it("detects raw moment object keys in relative and signed URLs", () => {
    expect(isRawMomentMediaPath("moments/event/raw/photo.jpg")).toBe(true);
    expect(
      isRawMomentMediaPath(
        "https://cdn.example.com/moments/event/raw/photo.jpg?sig=fake",
      ),
    ).toBe(true);
  });

  it("does not flag optimized moment object keys", () => {
    expect(isRawMomentMediaPath("moments/event/optimized/photo.webp")).toBe(
      false,
    );
  });
});
