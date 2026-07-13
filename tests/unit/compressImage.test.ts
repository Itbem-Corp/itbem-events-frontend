import { describe, expect, it } from "vitest";
import {
  predictedMomentUploadContentType,
  resolveMomentUploadContentType,
  shouldCompressMomentUploadImage,
} from "../../src/lib/momentUploadContentType";

const shouldSkipCompression = (mimeType: string): boolean =>
  !shouldCompressMomentUploadImage(mimeType);

describe("moment upload content type helpers", () => {
  it("skips video files", () => {
    expect(shouldSkipCompression("video/mp4")).toBe(true);
    expect(shouldSkipCompression("video/quicktime")).toBe(true);
    expect(shouldSkipCompression("video/webm")).toBe(true);
    expect(shouldSkipCompression("video/x-m4v")).toBe(true);
    expect(shouldSkipCompression("video/3gpp")).toBe(true);
    expect(shouldSkipCompression("video/x-msvideo")).toBe(true);
    expect(shouldSkipCompression("video/x-matroska")).toBe(true);
  });

  it("skips image formats that are kept as-is", () => {
    expect(shouldSkipCompression("image/gif")).toBe(true);
    expect(shouldSkipCompression("image/heic")).toBe(true);
    expect(shouldSkipCompression("image/heif")).toBe(true);
    expect(shouldSkipCompression("image/webp")).toBe(true);
    expect(shouldSkipCompression("image/avif")).toBe(true);
  });

  it("marks common raster images as compressible", () => {
    expect(shouldSkipCompression("image/jpeg")).toBe(false);
    expect(shouldSkipCompression("image/jpg")).toBe(false);
    expect(shouldSkipCompression("image/png")).toBe(false);
  });

  it("predicts JPEG for compressible original images", () => {
    expect(
      predictedMomentUploadContentType({
        name: "foto.png",
        type: "image/png",
      }),
    ).toBe("image/jpeg");
  });

  it("resolves the content type from the actual file that will be uploaded", () => {
    expect(
      resolveMomentUploadContentType({
        name: "foto.png",
        type: "image/png",
      }),
    ).toBe("image/png");
    expect(
      resolveMomentUploadContentType({
        name: "foto.jpg",
        type: "image/jpeg",
      }),
    ).toBe("image/jpeg");
  });

  it("normalizes the browser image/jpg alias before requesting backend uploads", () => {
    expect(
      resolveMomentUploadContentType({
        name: "foto.bin",
        type: "image/jpg",
      }),
    ).toBe("image/jpeg");
  });

  it("falls back to extensions when browser file type is empty", () => {
    expect(resolveMomentUploadContentType({ name: "clip.mov", type: "" })).toBe(
      "video/quicktime",
    );
    expect(resolveMomentUploadContentType({ name: "foto.webp", type: "" })).toBe(
      "image/webp",
    );
    expect(resolveMomentUploadContentType({ name: "foto.heic", type: "" })).toBe(
      "image/heic",
    );
    expect(resolveMomentUploadContentType({ name: "foto.heif", type: "" })).toBe(
      "image/heif",
    );
    expect(resolveMomentUploadContentType({ name: "clip.avi", type: "" })).toBe(
      "video/x-msvideo",
    );
    expect(resolveMomentUploadContentType({ name: "clip.mkv", type: "" })).toBe(
      "video/x-matroska",
    );
  });
});
