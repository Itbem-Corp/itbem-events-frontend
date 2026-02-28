import { describe, it, expect } from "vitest";

// Mirrors getMediaUrl() and isVideoUrl() from MomentWall.tsx (lines 28-36).

function getMediaUrl(contentUrl: string, EVENTS_URL: string): string {
  if (!contentUrl) return "";
  if (contentUrl.startsWith("http")) return contentUrl;
  return EVENTS_URL + "storage/" + contentUrl;
}

function isVideoUrl(url: string): boolean {
  return /\.(mp4|webm|mov|avi|m4v)(\?|$)/i.test(url);
}

describe("getMediaUrl", () => {
  const BASE = "https://events.example.com/";

  it("returns empty string for empty contentUrl", () => {
    expect(getMediaUrl("", BASE)).toBe("");
  });

  it("returns empty string for falsy contentUrl", () => {
    // TypeScript signature accepts string, but runtime may receive undefined/null from API
    expect(getMediaUrl(null as unknown as string, BASE)).toBe("");
    expect(getMediaUrl(undefined as unknown as string, BASE)).toBe("");
  });

  it("returns absolute http URL unchanged", () => {
    const abs = "http://cdn.example.com/photo.jpg";
    expect(getMediaUrl(abs, BASE)).toBe(abs);
  });

  it("returns absolute https URL unchanged", () => {
    const abs = "https://cdn.example.com/photo.jpg";
    expect(getMediaUrl(abs, BASE)).toBe(abs);
  });

  it("prepends EVENTS_URL + 'storage/' to a relative path", () => {
    expect(getMediaUrl("events/abc/photo.jpg", BASE)).toBe(
      "https://events.example.com/storage/events/abc/photo.jpg"
    );
  });

  it("works when EVENTS_URL already has a trailing slash", () => {
    expect(getMediaUrl("img.png", "https://api.example.com/")).toBe(
      "https://api.example.com/storage/img.png"
    );
  });
});

describe("isVideoUrl", () => {
  it("recognises .mp4 URLs", () => {
    expect(isVideoUrl("https://cdn.example.com/clip.mp4")).toBe(true);
  });

  it("recognises .webm URLs", () => {
    expect(isVideoUrl("https://cdn.example.com/clip.webm")).toBe(true);
  });

  it("recognises .mov URLs", () => {
    expect(isVideoUrl("https://cdn.example.com/clip.mov")).toBe(true);
  });

  it("recognises .avi URLs", () => {
    expect(isVideoUrl("clip.avi")).toBe(true);
  });

  it("recognises .m4v URLs", () => {
    expect(isVideoUrl("clip.m4v")).toBe(true);
  });

  it("recognises video URLs with query strings", () => {
    expect(isVideoUrl("https://cdn.example.com/clip.mp4?token=abc")).toBe(true);
  });

  it("returns false for image URLs", () => {
    expect(isVideoUrl("https://cdn.example.com/photo.jpg")).toBe(false);
    expect(isVideoUrl("https://cdn.example.com/photo.png")).toBe(false);
    expect(isVideoUrl("photo.webp")).toBe(false);
  });

  it("is case-insensitive", () => {
    expect(isVideoUrl("clip.MP4")).toBe(true);
    expect(isVideoUrl("clip.MOV")).toBe(true);
  });
});
