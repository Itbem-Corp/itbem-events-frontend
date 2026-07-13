import { isVideoUploadFile, uploadFileExtension } from "./uploadFilePolicy";

export interface MomentImageOptimizationOptions {
  maxDimension?: number;
  quality?: number;
  signal?: AbortSignal;
}

const PASSTHROUGH_IMAGE_TYPES = new Set([
  "image/gif",
  "image/heic",
  "image/heif",
  "image/webp",
  "image/avif",
]);

const OPTIMIZABLE_IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png"]);
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

function optimizedFileName(name: string): string {
  const base = name.replace(/\.[^.]+$/, "") || "momento";
  return `${base}.webp`;
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
    maxDimension = 2560,
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

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/webp", quality),
    );
    throwIfAborted(signal);
    if (!blob || blob.type !== "image/webp" || blob.size >= file.size * 0.98) {
      return file;
    }

    return new File([blob], optimizedFileName(file.name), {
      type: "image/webp",
      lastModified: file.lastModified,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw error;
    return file;
  } finally {
    cleanup();
  }
}
