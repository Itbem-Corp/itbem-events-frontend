import { describe, it, expect } from "vitest";

// Mirrors constants and validateFile() from SharedUploadPage.tsx (lines 43-90).

const MAX_IMAGE_BYTES = 25 * 1024 * 1024; // 25 MB
const MAX_VIDEO_BYTES = 200 * 1024 * 1024; // 200 MB

const ALLOWED_TYPES = [
  "image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif",
  "image/heic", "image/heif", "image/avif",
  "video/mp4", "video/webm", "video/quicktime", "video/x-m4v", "video/3gpp",
];
const ALLOWED_EXTENSIONS = [
  "jpg", "jpeg", "png", "webp", "gif", "heic", "heif", "avif",
  "mp4", "mov", "webm", "m4v", "3gp",
];

function validateFile(name: string, type: string, size: number): string | null {
  const isVideo = type.startsWith("video/");
  const maxBytes = isVideo ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
  if (size > maxBytes) {
    const maxMB = isVideo ? 200 : 25;
    return `"${name}" excede ${maxMB} MB.`;
  }
  const ext = name.toLowerCase().split(".").pop() ?? "";
  if (!ALLOWED_TYPES.includes(type) && !ALLOWED_EXTENSIONS.includes(ext)) {
    return `"${name}" tiene formato no soportado.`;
  }
  return null;
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

  it("accepts a file by extension even when MIME type is empty (iOS/Android quirk)", () => {
    // Some mobile browsers report type="" for HEIC/HEIF files.
    // validateFile falls back to extension matching.
    expect(validateFile("photo.heic", "", 1024)).toBeNull();
    expect(validateFile("photo.mov", "", 1024)).toBeNull();
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
