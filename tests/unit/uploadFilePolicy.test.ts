import { describe, expect, it } from "vitest";
import {
  UPLOAD_FILE_ACCEPT,
  UPLOAD_IMAGE_MAX_BYTES,
  UPLOAD_VIDEO_MAX_BYTES,
  isVideoUploadFile,
  uploadFileExtension,
  uploadMaxBytesForFile,
  uploadMaxMegabytesForFile,
  validateUploadFile,
} from "../../src/lib/uploadFilePolicy";

describe("uploadFilePolicy", () => {
  it("detects videos by MIME type", () => {
    expect(isVideoUploadFile({ name: "clip.bin", type: "video/mp4" })).toBe(true);
  });

  it("detects videos by extension when mobile browsers omit MIME type", () => {
    const file = { name: "recuerdo.MOV", type: "" };

    expect(isVideoUploadFile(file)).toBe(true);
    expect(uploadMaxBytesForFile(file)).toBe(UPLOAD_VIDEO_MAX_BYTES);
    expect(uploadMaxMegabytesForFile(file)).toBe(200);
    expect(isVideoUploadFile({ name: "recuerdo.3gp", type: "" })).toBe(true);
    expect(isVideoUploadFile({ name: "recuerdo.avi", type: "" })).toBe(true);
    expect(isVideoUploadFile({ name: "recuerdo.mkv", type: "" })).toBe(true);
  });

  it("keeps image-sized limits for image extensions", () => {
    const file = { name: "foto.heic", type: "" };

    expect(uploadFileExtension(file)).toBe("heic");
    expect(isVideoUploadFile(file)).toBe(false);
    expect(uploadMaxBytesForFile(file)).toBe(UPLOAD_IMAGE_MAX_BYTES);
    expect(uploadMaxMegabytesForFile(file)).toBe(25);
  });

  it("validates allowed types, extensions, and backend-aligned size limits", () => {
    expect(validateUploadFile({ name: "foto.heic", type: "", size: 1024 })).toBeNull();
    expect(
      validateUploadFile({
        name: "clip.mov",
        type: "",
        size: UPLOAD_VIDEO_MAX_BYTES,
      }),
    ).toBeNull();
    expect(
      validateUploadFile({
        name: "clip.avi",
        type: "video/x-msvideo",
        size: 1024,
      }),
    ).toBeNull();
    expect(
      validateUploadFile({
        name: "clip.mkv",
        type: "",
        size: 1024,
      }),
    ).toBeNull();
    expect(
      validateUploadFile({
        name: "big.jpg",
        type: "image/jpeg",
        size: UPLOAD_IMAGE_MAX_BYTES + 1,
      }),
    ).toContain("25 MB");
    expect(
      validateUploadFile({
        name: "malware.exe",
        type: "application/x-msdownload",
        size: 1024,
      }),
    ).toContain("formato no soportado");
  });

  it("exports one accept string for public upload inputs", () => {
    expect(UPLOAD_FILE_ACCEPT).toContain("image/heic");
    expect(UPLOAD_FILE_ACCEPT).toContain(".mov");
    expect(UPLOAD_FILE_ACCEPT).toContain("video/mp4");
    expect(UPLOAD_FILE_ACCEPT).toContain("video/x-msvideo");
    expect(UPLOAD_FILE_ACCEPT).toContain(".mkv");
  });
});
