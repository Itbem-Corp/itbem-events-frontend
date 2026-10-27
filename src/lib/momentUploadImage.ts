import { isVideoUploadFile, uploadFileExtension } from "./uploadFilePolicy";

export interface MomentImageOptimizationOptions {
  maxDimension?: number;
  quality?: number;
  signal?: AbortSignal;
}

// GIF stays untouched (canvas would drop the animation), and so do animated
// WebP/AVIF (see isAnimatedImage). HEIC/HEIF/WebP/AVIF are optimized when the
// browser can decode them; otherwise the original is kept.
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

// Some mobile browsers report HEIC as "" or application/octet-stream; both mean
// "unknown", so the extension decides.
function knownImageType(file: Pick<File, "type">): string {
  const type = file.type.trim().toLowerCase();
  return type === "application/octet-stream" ? "" : type;
}

export function shouldOptimizeMomentImage(
  file: Pick<File, "type" | "name">,
): boolean {
  const type = knownImageType(file);
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

// Formats that never carry transparency, so a JPEG fallback cannot blacken it.
const OPAQUE_IMAGE_TYPES = new Set(["image/jpeg", "image/jpg", "image/heic", "image/heif"]);
const OPAQUE_IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "heic", "heif"]);

function isOpaqueImage(file: Pick<File, "type" | "name">): boolean {
  const type = knownImageType(file);
  return type
    ? OPAQUE_IMAGE_TYPES.has(type)
    : OPAQUE_IMAGE_EXTENSIONS.has(uploadFileExtension(file));
}

// Prefers WebP; browsers that cannot encode it (toBlob falls back to PNG) get
// JPEG, but only for opaque sources: JPEG has no alpha and a transparent PNG,
// WebP or AVIF would come out with a black background. Those keep the original.
async function encodeOptimized(
  canvas: HTMLCanvasElement,
  quality: number,
  allowJpeg: boolean,
): Promise<Blob | null> {
  const types = allowJpeg ? ["image/webp", "image/jpeg"] : ["image/webp"];
  for (const type of types) {
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, type, quality),
    );
    if (blob && blob.type === type) return blob;
  }
  return null;
}

function ascii(bytes: Uint8Array, start: number, end: number): string {
  return String.fromCharCode(...bytes.subarray(start, end));
}

// Animated WebP sets the animation flag (0x02) in its VP8X header; animated AVIF
// declares the "avis" brand in its ftyp box. Drawing either on a canvas keeps
// only the first frame, so they upload untouched like GIF.
async function isAnimatedImage(file: File): Promise<boolean> {
  const type = knownImageType(file);
  const extension = uploadFileExtension(file);
  const isWebp = type === "image/webp" || (!type && extension === "webp");
  const isAvif = type === "image/avif" || (!type && extension === "avif");
  if (!isWebp && !isAvif) return false;

  const bytes = new Uint8Array(await file.slice(0, 64).arrayBuffer());
  if (isWebp) {
    return (
      ascii(bytes, 0, 4) === "RIFF" &&
      ascii(bytes, 8, 12) === "WEBP" &&
      ascii(bytes, 12, 16) === "VP8X" &&
      (bytes[20] & 0x02) !== 0
    );
  }
  if (ascii(bytes, 4, 8) !== "ftyp") return false;
  const boxSize = Math.min(
    bytes.length,
    ((bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3]) >>> 0,
  );
  // Major brand at 8..12, then compatible brands after the minor version.
  if (ascii(bytes, 8, 12) === "avis") return true;
  for (let offset = 16; offset + 4 <= boxSize; offset += 4) {
    if (ascii(bytes, offset, offset + 4) === "avis") return true;
  }
  return false;
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
    if (await isAnimatedImage(file)) return file;
    throwIfAborted(signal);

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

    const blob = await encodeOptimized(canvas, quality, isOpaqueImage(file));
    throwIfAborted(signal);
    // Keep the original unless the result is at least 2 % smaller.
    if (!blob || blob.size > file.size * 0.98) {
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
