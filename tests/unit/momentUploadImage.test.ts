import { describe, expect, it } from "vitest";
import {
  optimizeMomentUploadImage,
  shouldOptimizeMomentImage,
} from "../../src/lib/momentUploadImage";

describe("momentUploadImage", () => {
  it.each(["image/jpeg", "image/png"])("optimizes %s uploads", (type) => {
    expect(shouldOptimizeMomentImage({ type, name: "foto.jpg" })).toBe(true);
  });

  it.each(["image/webp", "image/avif", "image/gif", "image/heic", "video/mp4"])(
    "preserves already efficient or special media %s",
    (type) => {
      expect(shouldOptimizeMomentImage({ type, name: "archivo.bin" })).toBe(
        false,
      );
    },
  );

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
