import { describe, it, expect } from "vitest";

// Mirrors the skip logic inside compressImage() in SharedUploadPage.tsx (lines 195-202).
// compressImage returns the original file unchanged when any of these conditions hold.
const shouldSkipCompression = (mimeType: string): boolean =>
  mimeType.startsWith("video/") ||
  mimeType === "image/gif" ||
  mimeType === "image/heic" ||
  mimeType === "image/heif" ||
  mimeType === "image/webp" ||
  mimeType === "image/avif";

describe("compression skip logic (mirrors compressImage in SharedUploadPage.tsx)", () => {
  it("skips video/mp4", () => {
    expect(shouldSkipCompression("video/mp4")).toBe(true);
  });

  it("skips video/quicktime (MOV)", () => {
    expect(shouldSkipCompression("video/quicktime")).toBe(true);
  });

  it("skips video/webm", () => {
    expect(shouldSkipCompression("video/webm")).toBe(true);
  });

  it("skips any video/* prefix", () => {
    expect(shouldSkipCompression("video/x-m4v")).toBe(true);
    expect(shouldSkipCompression("video/3gpp")).toBe(true);
  });

  it("skips image/gif", () => {
    expect(shouldSkipCompression("image/gif")).toBe(true);
  });

  it("skips image/heic", () => {
    expect(shouldSkipCompression("image/heic")).toBe(true);
  });

  it("skips image/heif", () => {
    expect(shouldSkipCompression("image/heif")).toBe(true);
  });

  it("skips image/webp (already compressed format)", () => {
    expect(shouldSkipCompression("image/webp")).toBe(true);
  });

  it("skips image/avif (already compressed format)", () => {
    expect(shouldSkipCompression("image/avif")).toBe(true);
  });

  it("does NOT skip image/jpeg — should be compressed", () => {
    expect(shouldSkipCompression("image/jpeg")).toBe(false);
  });

  it("does NOT skip image/jpg — should be compressed", () => {
    expect(shouldSkipCompression("image/jpg")).toBe(false);
  });

  it("does NOT skip image/png — should be compressed", () => {
    expect(shouldSkipCompression("image/png")).toBe(false);
  });
});
