export interface MomentUploadFileLike {
  name: string;
  type?: string | null;
}

function cleanContentType(value: unknown): string {
  const contentType = typeof value === "string" ? value.trim().toLowerCase() : "";
  return contentType === "image/jpg" ? "image/jpeg" : contentType;
}

function extensionFor(file: MomentUploadFileLike): string {
  const name = file.name.toLowerCase();
  const index = name.lastIndexOf(".");
  return index === -1 ? "" : name.slice(index + 1);
}

export function resolveMomentUploadContentType(file: MomentUploadFileLike): string {
  const contentType = cleanContentType(file.type);
  if (contentType) return contentType;

  switch (extensionFor(file)) {
    case "heic":
      return "image/heic";
    case "heif":
      return "image/heif";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "png":
      return "image/png";
    case "gif":
      return "image/gif";
    case "webp":
      return "image/webp";
    case "avif":
      return "image/avif";
    case "mp4":
      return "video/mp4";
    case "mov":
      return "video/quicktime";
    case "webm":
      return "video/webm";
    case "m4v":
      return "video/x-m4v";
    case "3gp":
      return "video/3gpp";
    case "avi":
      return "video/x-msvideo";
    case "mkv":
      return "video/x-matroska";
    default:
      return "application/octet-stream";
  }
}

export function shouldCompressMomentUploadImage(contentType: string): boolean {
  const ct = cleanContentType(contentType);
  return (
    ct.startsWith("image/") &&
    ct !== "image/gif" &&
    ct !== "image/heic" &&
    ct !== "image/heif" &&
    ct !== "image/webp" &&
    ct !== "image/avif"
  );
}

export function predictedMomentUploadContentType(file: MomentUploadFileLike): string {
  const contentType = resolveMomentUploadContentType(file);
  return shouldCompressMomentUploadImage(contentType) ? "image/jpeg" : contentType;
}
