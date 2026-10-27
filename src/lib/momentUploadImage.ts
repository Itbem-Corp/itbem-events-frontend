import { isVideoUploadFile, uploadFileExtension } from "./uploadFilePolicy";

export interface MomentImageOptimizationOptions {
  maxDimension?: number;
  quality?: number;
  signal?: AbortSignal;
}

// GIF stays untouched (canvas would drop the animation). HEIC/HEIF/WebP/AVIF are
// optimized when the browser can decode them; otherwise the original is kept.
const PASSTHROUGH_IMAGE_TYPES = new Set(["image/gif"]);

const OPTIMIZABLE_IMAGE_EXTENSIONS = new Set([
  "jpg",
  "jpeg",
  "png",
  "heic",
  "heif",
  "webp",
  "avif",
]);
const MIN_OPTIMIZATION_BYTES = 700 * 1024;

export function shouldOptimizeMomentImage(
  file: Pick<File, "type" | "name">,
): boolean {
  const type = file.type.trim().toLowerCase();
  const isKnownImage =
    type.startsWith("image/") ||
    (!type && OPTIMIZABLE_IMAGE_EXTENSIONS.has(uploadFileExtension(file)));
  return (
    !isVideoUploadFile(file) &&
    isKnownImage &&
    !PASSTHROUGH_IMAGE_TYPES.has(type)
  );
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new DOMException("Image optimization aborted", "AbortError");
  }
}

const OUTPUT_EXTENSIONS: Record<string, string> = {
  "image/webp": "webp",
  "image/jpeg": "jpg",
};

function optimizedFileName(name: string, type: string): string {
  const base = name.replace(/\.[^.]+$/, "") || "momento";
  return `${base}.${OUTPUT_EXTENSIONS[type] ?? "webp"}`;
}

// Prefers WebP; browsers that cannot encode it (toBlob falls back to PNG) get JPEG.
async function encodeOptimized(
  canvas: HTMLCanvasElement,
  quality: number,
): Promise<Blob | null> {
  for (const type of ["image/webp", "image/jpeg"]) {
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, type, quality),
    );
    if (blob && blob.type === type) return blob;
  }
  return null;
}

async function loadFallbackImage(file: File): Promise<{
  source: HTMLImageElement;
  width: number;
  height: number;
  cleanup: () => void;
}> {
  const source = new Image();
  const objectUrl = URL.createObjectURL(file);
  await new Promise<void>((resolve, reject) => {
    source.onload = () => resolve();
    source.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("No se pudo leer la imagen."));
    };
    source.src = objectUrl;
  });
  return {
    source,
    width: source.naturalWidth,
    height: source.naturalHeight,
    cleanup: () => URL.revokeObjectURL(objectUrl),
  };
}

export async function optimizeMomentUploadImage(
  file: File,
  {
    maxDimension = 2048,
    quality = 0.9,
    signal,
  }: MomentImageOptimizationOptions = {},
): Promise<File> {
  if (!shouldOptimizeMomentImage(file) || file.size < MIN_OPTIMIZATION_BYTES) {
    return file;
  }
  throwIfAborted(signal);

  let source: CanvasImageSource;
  let width: number;
  let height: number;
  let cleanup = () => {};

  try {
    if (typeof createImageBitmap === "function") {
      try {
        const bitmap = await createImageBitmap(file, {
          imageOrientation: "from-image",
        });
        source = bitmap;
        width = bitmap.width;
        height = bitmap.height;
        cleanup = () => bitmap.close();
      } catch {
        const fallback = await loadFallbackImage(file);
        source = fallback.source;
        width = fallback.width;
        height = fallback.height;
        cleanup = fallback.cleanup;
      }
    } else {
      const fallback = await loadFallbackImage(file);
      source = fallback.source;
      width = fallback.width;
      height = fallback.height;
      cleanup = fallback.cleanup;
    }

    throwIfAborted(signal);
    const scale = Math.min(1, maxDimension / Math.max(width, height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const context = canvas.getContext("2d", { alpha: true });
    if (!context) return file;
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(source, 0, 0, canvas.width, canvas.height);

    const blob = await encodeOptimized(canvas, quality);
    throwIfAborted(signal);
    // Keep the original unless the result is at least 2 % smaller.
    if (!blob || blob.size >= file.size * 0.98) {
      return file;
    }

    return new File([blob], optimizedFileName(file.name, blob.type), {
      type: blob.type,
      lastModified: file.lastModified,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw error;
    return file;
  } finally {
    cleanup();
  }
}
