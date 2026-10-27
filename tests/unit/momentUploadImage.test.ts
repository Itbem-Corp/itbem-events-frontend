import { describe, expect, it } from "vitest";
import {
  optimizeMomentUploadImage,
  shouldOptimizeMomentImage,
} from "../../src/lib/momentUploadImage";

describe("momentUploadImage", () => {
  it.each([
    "image/jpeg",
    "image/png",
    "image/heic",
    "image/heif",
    "image/webp",
    "image/avif",
  ])("optimizes %s uploads", (type) => {
    expect(shouldOptimizeMomentImage({ type, name: "foto.jpg" })).toBe(true);
  });

  it.each(["image/gif", "video/mp4"])(
    "preserves special media %s",
    (type) => {
      expect(shouldOptimizeMomentImage({ type, name: "archivo.bin" })).toBe(
        false,
      );
    },
  );

  it.each(["foto.HEIC", "foto.heif"])(
    "optimizes %s when the browser omits the MIME type",
    (name) => {
      expect(shouldOptimizeMomentImage({ type: "", name })).toBe(true);
    },
  );

  it("returns the original HEIC when the browser cannot decode it", async () => {
    const file = new File([new Uint8Array(800 * 1024)], "foto.heic", {
      type: "image/heic",
    });

    await expect(optimizeMomentUploadImage(file)).resolves.toBe(file);
  });

  it("uses the extension when a mobile browser omits the MIME type", () => {
    expect(shouldOptimizeMomentImage({ type: "", name: "foto.JPEG" })).toBe(
      true,
    );
  });

  it("uploads already-small images directly without spending time re-encoding", async () => {
    const file = new File([new Uint8Array(1024)], "foto.jpg", {
      type: "image/jpeg",
    });

    await expect(optimizeMomentUploadImage(file)).resolves.toBe(file);
  });
});
