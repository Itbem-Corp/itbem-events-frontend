export const UPLOAD_IMAGE_MAX_BYTES = 25 * 1024 * 1024;
export const UPLOAD_VIDEO_MAX_BYTES = 200 * 1024 * 1024;

const VIDEO_EXTENSIONS = new Set(["mp4", "mov", "webm", "m4v", "3gp", "avi", "mkv"]);
export const UPLOAD_ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
  "image/avif",
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "video/x-m4v",
  "video/3gpp",
  "video/x-msvideo",
  "video/x-matroska",
];
export const UPLOAD_ALLOWED_EXTENSIONS = [
  "jpg",
  "jpeg",
  "png",
  "webp",
  "gif",
  "heic",
  "heif",
  "avif",
  "mp4",
  "mov",
  "webm",
  "m4v",
  "3gp",
  "avi",
  "mkv",
];
export const UPLOAD_FILE_ACCEPT = [
  ...UPLOAD_ALLOWED_MIME_TYPES,
  ...UPLOAD_ALLOWED_EXTENSIONS.map((ext) => `.${ext}`),
].join(",");

interface UploadFileLike {
  name?: string;
  type?: string;
  size?: number;
}

export function uploadFileExtension(file: UploadFileLike): string {
  const name = file.name ?? "";
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot + 1).trim().toLowerCase() : "";
}

export function isVideoUploadFile(file: UploadFileLike): boolean {
  const type = file.type?.trim().toLowerCase() ?? "";
  return type.startsWith("video/") || VIDEO_EXTENSIONS.has(uploadFileExtension(file));
}

export function uploadMaxBytesForFile(file: UploadFileLike): number {
  return isVideoUploadFile(file) ? UPLOAD_VIDEO_MAX_BYTES : UPLOAD_IMAGE_MAX_BYTES;
}

export function uploadMaxMegabytesForFile(file: UploadFileLike): number {
  return isVideoUploadFile(file) ? 200 : 25;
}

export function validateUploadFile(file: UploadFileLike): string | null {
  const fileName = file.name?.trim() || "Archivo";
  const maxBytes = uploadMaxBytesForFile(file);
  if (
    typeof file.size === "number" &&
    Number.isFinite(file.size) &&
    file.size > maxBytes
  ) {
    const maxMB = uploadMaxMegabytesForFile(file);
    return `"${fileName}" excede ${maxMB} MB.`;
  }

  const type = file.type?.trim().toLowerCase() ?? "";
  const ext = uploadFileExtension(file);
  if (
    !UPLOAD_ALLOWED_MIME_TYPES.includes(type) &&
    !UPLOAD_ALLOWED_EXTENSIONS.includes(ext)
  ) {
    return `"${fileName}" tiene formato no soportado.`;
  }
  return null;
}
