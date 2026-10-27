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

  describe("2 % minimum saving", () => {
    const ORIGINAL_BYTES = 1_000_000;
    const stubEncoderProducing = (bytes: number) => {
      vi.stubGlobal("document", {
        createElement: () => ({
          width: 0,
          height: 0,
          getContext: () => ({ drawImage: () => {} }),
          toBlob: (resolve: (blob: Blob | null) => void, type: string) =>
            resolve(new Blob([new Uint8Array(bytes)], { type })),
        }),
      });
      vi.stubGlobal(
        "createImageBitmap",
        vi.fn(async () => ({ width: 1600, height: 1200, close: () => {} })),
      );
    };
    const heic = () =>
      new File([new Uint8Array(ORIGINAL_BYTES)], "foto.heic", {
        type: "image/heic",
      });

    it.each([
      ["equal size", ORIGINAL_BYTES],
      ["only 1 % smaller", 990_000],
      ["1 byte short of 2 % smaller", 980_001],
    ])("keeps the original when the result is %s", async (_label, bytes) => {
      stubEncoderProducing(bytes);
      try {
        const file = heic();
        await expect(optimizeMomentUploadImage(file)).resolves.toBe(file);
      } finally {
        vi.unstubAllGlobals();
      }
    });

    it.each([
      ["exactly 2 % smaller", 980_000],
      ["3 % smaller", 970_000],
    ])("uploads the optimized file when it is %s", async (_label, bytes) => {
      stubEncoderProducing(bytes);
      try {
        const file = heic();
        const result = await optimizeMomentUploadImage(file);
        expect(result).not.toBe(file);
        expect(result.size).toBe(bytes);
        expect(result.type).toBe("image/webp");
      } finally {
        vi.unstubAllGlobals();
      }
    });
  });

  it("decodes with EXIF orientation applied and sizes the canvas from the rotated bitmap", async () => {
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
    // A portrait iPhone photo is stored 4032x3024 with EXIF orientation 6;
    // decoding "from-image" hands back the upright 3024x4032 bitmap.
    const decode = vi.fn(async () => ({
      width: 3024,
      height: 4032,
      close: () => {},
    }));
    vi.stubGlobal("createImageBitmap", decode);

    try {
      const file = new File([new Uint8Array(800 * 1024)], "retrato.heic", {
        type: "image/heic",
      });
      await optimizeMomentUploadImage(file);

      expect(decode).toHaveBeenCalledWith(file, {
        imageOrientation: "from-image",
      });
      expect(canvases[0]).toMatchObject({ width: 1536, height: 2048 });
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
    const decode = vi.fn(async () => {
      throw new DOMException("The source image could not be decoded.", "InvalidStateError");
    });
    class UndecodableImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_value: string) {
        queueMicrotask(() => this.onerror?.());
      }
    }
    vi.stubGlobal("createImageBitmap", decode);
    vi.stubGlobal("Image", UndecodableImage);
    const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    const create = vi
      .spyOn(URL, "createObjectURL")
      .mockImplementation(() => "blob:heic");

    try {
      const file = new File([new Uint8Array(800 * 1024)], "foto.heic", {
        type: "image/heic",
      });

      await expect(optimizeMomentUploadImage(file)).resolves.toBe(file);
      expect(decode).toHaveBeenCalledOnce();
      expect(revoke).toHaveBeenCalledWith("blob:heic");
    } finally {
      create.mockRestore();
      revoke.mockRestore();
      vi.unstubAllGlobals();
    }
  });

  it("optimizes a .heic reported as application/octet-stream", () => {
    expect(
      shouldOptimizeMomentImage({
        type: "application/octet-stream",
        name: "IMG_0003.HEIC",
      }),
    ).toBe(true);
    expect(
      shouldOptimizeMomentImage({
        type: "application/octet-stream",
        name: "archivo.bin",
      }),
    ).toBe(false);
  });

  describe("animated WebP/AVIF", () => {
    const padded = (header: number[]) => {
      const bytes = new Uint8Array(800 * 1024);
      bytes.set(header);
      return bytes;
    };
    const ascii = (text: string) => [...text].map((c) => c.charCodeAt(0));
    const webpHeader = (flags: number) => [
      ...ascii("RIFF"),
      0, 0, 0, 0,
      ...ascii("WEBP"),
      ...ascii("VP8X"),
      10, 0, 0, 0,
      flags,
    ];
    const avifHeader = (brands: string[]) => [
      0, 0, 0, 16 + brands.length * 4,
      ...ascii("ftyp"),
      ...ascii("avif"),
      0, 0, 0, 0,
      ...brands.flatMap(ascii),
    ];
    const stubDecoder = () => {
      const decode = vi.fn(async () => ({
        width: 2000,
        height: 1500,
        close: () => {},
      }));
      vi.stubGlobal("createImageBitmap", decode);
      vi.stubGlobal("document", {
        createElement: () => ({
          width: 0,
          height: 0,
          getContext: () => ({ drawImage: () => {} }),
          toBlob: (resolve: (blob: Blob | null) => void, type: string) =>
            resolve(new Blob([new Uint8Array(10)], { type })),
        }),
      });
      return decode;
    };

    it.each([
      ["animated WebP", "anim.webp", "image/webp", webpHeader(0x02)],
      ["animated AVIF", "anim.avif", "image/avif", avifHeader(["mif1", "avis"])],
    ])("uploads an %s untouched", async (_label, name, type, header) => {
      const decode = stubDecoder();
      try {
        const file = new File([padded(header)], name, { type });
        await expect(optimizeMomentUploadImage(file)).resolves.toBe(file);
        expect(decode).not.toHaveBeenCalled();
      } finally {
        vi.unstubAllGlobals();
      }
    });

    it.each([
      ["still WebP", "foto.webp", "image/webp", webpHeader(0x10)],
      ["still AVIF", "foto.avif", "image/avif", avifHeader(["mif1", "miaf"])],
    ])("still optimizes a %s", async (_label, name, type, header) => {
      stubDecoder();
      try {
        const file = new File([padded(header)], name, { type });
        const result = await optimizeMomentUploadImage(file);
        expect(result).not.toBe(file);
        expect(result.type).toBe("image/webp");
      } finally {
        vi.unstubAllGlobals();
      }
    });
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
