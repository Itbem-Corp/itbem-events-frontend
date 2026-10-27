import { describe, expect, it, vi } from "vitest";
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

  it("resizes to at most 2048 px by default and keeps the encoded type", async () => {
    const canvases: { width: number; height: number }[] = [];
    vi.stubGlobal("document", {
      createElement: () => {
        const canvas = {
          width: 0,
          height: 0,
          getContext: () => ({ drawImage: () => {} }),
          toBlob: (resolve: (blob: Blob | null) => void, type: string) =>
            resolve(new Blob([new Uint8Array(10)], { type })),
        };
        canvases.push(canvas);
        return canvas;
      },
    });
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn(async () => ({ width: 4032, height: 3024, close: () => {} })),
    );

    try {
      const file = new File([new Uint8Array(800 * 1024)], "IMG_0001.HEIC", {
        type: "image/heic",
      });
      const result = await optimizeMomentUploadImage(file);

      expect(canvases[0]).toMatchObject({ width: 2048, height: 1536 });
      expect(result.type).toBe("image/webp");
      expect(result.name).toBe("IMG_0001.webp");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  describe("when the browser cannot encode WebP (toBlob falls back to PNG)", () => {
    const stubCanvasWithoutWebp = () => {
      vi.stubGlobal("document", {
        createElement: () => ({
          width: 0,
          height: 0,
          getContext: () => ({ drawImage: () => {} }),
          toBlob: (resolve: (blob: Blob | null) => void, type: string) =>
            resolve(
              new Blob([new Uint8Array(10)], {
                type: type === "image/webp" ? "image/png" : type,
              }),
            ),
        }),
      });
      vi.stubGlobal(
        "createImageBitmap",
        vi.fn(async () => ({ width: 3000, height: 2000, close: () => {} })),
      );
    };

    it("uploads an opaque HEIC as JPEG", async () => {
      stubCanvasWithoutWebp();
      try {
        const file = new File([new Uint8Array(800 * 1024)], "IMG_0002.heic", {
          type: "image/heic",
        });
        const result = await optimizeMomentUploadImage(file);

        expect(result.type).toBe("image/jpeg");
        expect(result.name).toBe("IMG_0002.jpg");
      } finally {
        vi.unstubAllGlobals();
      }
    });

    it("keeps a possibly transparent PNG instead of blackening it as JPEG", async () => {
      stubCanvasWithoutWebp();
      try {
        const file = new File([new Uint8Array(800 * 1024)], "logo.png", {
          type: "image/png",
        });

        await expect(optimizeMomentUploadImage(file)).resolves.toBe(file);
      } finally {
        vi.unstubAllGlobals();
      }
    });
  });

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
