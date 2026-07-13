import { describe, it, expect } from "vitest";
import { validateUploadFile } from "../../src/lib/uploadFilePolicy";

const MAX_IMAGE_BYTES = 25 * 1024 * 1024; // 25 MB
const MAX_VIDEO_BYTES = 200 * 1024 * 1024; // 200 MB

function validateFile(name: string, type: string, size: number): string | null {
  return validateUploadFile({ name, type, size });
}

describe("validateFile — size limits", () => {
  it("accepts an image under 25 MB", () => {
    expect(validateFile("photo.jpg", "image/jpeg", 10 * 1024 * 1024)).toBeNull();
  });

  it("accepts an image at exactly 25 MB boundary", () => {
    expect(validateFile("photo.png", "image/png", MAX_IMAGE_BYTES)).toBeNull();
  });

  it("rejects an image over 25 MB", () => {
    const err = validateFile("big.jpg", "image/jpeg", MAX_IMAGE_BYTES + 1);
    expect(err).not.toBeNull();
    expect(err).toContain("25 MB");
    expect(err).toContain("big.jpg");
  });

  it("accepts a video under 200 MB", () => {
    expect(validateFile("clip.mp4", "video/mp4", 100 * 1024 * 1024)).toBeNull();
  });

  it("accepts a video at exactly 200 MB boundary", () => {
    expect(validateFile("clip.mp4", "video/mp4", MAX_VIDEO_BYTES)).toBeNull();
  });

  it("rejects a video over 200 MB", () => {
    const err = validateFile("big.mp4", "video/mp4", MAX_VIDEO_BYTES + 1);
    expect(err).not.toBeNull();
    expect(err).toContain("200 MB");
    expect(err).toContain("big.mp4");
  });
});

describe("validateFile — type/extension checks", () => {
  it("accepts image/jpeg", () => {
    expect(validateFile("photo.jpg", "image/jpeg", 1024)).toBeNull();
  });

  it("accepts image/png", () => {
    expect(validateFile("photo.png", "image/png", 1024)).toBeNull();
  });

  it("accepts image/heic (iOS photo format)", () => {
    expect(validateFile("photo.heic", "image/heic", 1024)).toBeNull();
  });

  it("accepts video/quicktime (.mov)", () => {
    expect(validateFile("clip.mov", "video/quicktime", 1024)).toBeNull();
  });

  it("accepts video/mp4", () => {
    expect(validateFile("clip.mp4", "video/mp4", 1024)).toBeNull();
  });

  it("accepts backend-supported avi and mkv videos", () => {
    expect(validateFile("clip.avi", "video/x-msvideo", 1024)).toBeNull();
    expect(validateFile("clip.mkv", "video/x-matroska", 1024)).toBeNull();
  });

  it("accepts a file by extension even when MIME type is empty (iOS/Android quirk)", () => {
    // Some mobile browsers report type="" for HEIC/HEIF files.
    // validateFile falls back to extension matching.
    expect(validateFile("photo.heic", "", 1024)).toBeNull();
    expect(validateFile("photo.mov", "", 1024)).toBeNull();
    expect(validateFile("clip.avi", "", 1024)).toBeNull();
    expect(validateFile("clip.mkv", "", 1024)).toBeNull();
  });

  it("rejects an unsupported type with no recognised extension", () => {
    const err = validateFile("document.pdf", "application/pdf", 1024);
    expect(err).not.toBeNull();
    expect(err).toContain("formato no soportado");
  });

  it("rejects an executable file", () => {
    const err = validateFile("malware.exe", "application/x-msdownload", 1024);
    expect(err).not.toBeNull();
    expect(err).toContain("formato no soportado");
  });
});
