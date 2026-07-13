import { normalizeEventsUrl } from "./eventsUrl";

function isAbsoluteUrl(value: string): boolean {
  return value.startsWith("//") || /^[a-z][a-z0-9+.-]*:/i.test(value);
}

function mediaPathname(value: string | null | undefined): string {
  const raw = value?.trim() ?? "";
  if (!raw) return "";

  try {
    return decodeURIComponent(new URL(raw).pathname);
  } catch {
    return raw;
  }
}

export function resolvePublicMediaUrl(
  mediaPath: string | null | undefined,
  eventsUrl: string,
): string {
  if (!mediaPath) return "";

  const trimmed = mediaPath.trim();
  if (!trimmed) return "";
  if (isAbsoluteUrl(trimmed)) return trimmed;

  const base = normalizeEventsUrl(eventsUrl);
  const cleanPath = trimmed.replace(/^\/+/, "");
  const storagePath = cleanPath.startsWith("storage/")
    ? cleanPath
    : `storage/${cleanPath}`;

  return new URL(storagePath, base).toString();
}

export function isVideoMediaUrl(value: string | null | undefined): boolean {
  return /\.(mp4|webm|mov|avi|mkv|m4v|3gp)([?#]|$)/i.test(mediaPathname(value));
}

export function isVideoContentType(value: string | null | undefined): boolean {
  return value?.trim().toLowerCase().startsWith("video/") ?? false;
}

export function isVideoMedia(
  mediaPath: string | null | undefined,
  contentType?: string | null,
): boolean {
  return isVideoContentType(contentType) || isVideoMediaUrl(mediaPath);
}

export function isRawMomentMediaPath(value: string | null | undefined): boolean {
  const pathname = mediaPathname(value).replace(/\\/g, "/");
  return /(^|\/)raw\//i.test(pathname) || /\/raw\//i.test(pathname);
}
