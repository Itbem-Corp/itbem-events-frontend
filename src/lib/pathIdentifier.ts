export function decodePathIdentifier(raw: string | null | undefined): string {
  if (!raw) return "";
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export function normalizePathSegment(raw: string | null | undefined): string {
  return decodePathIdentifier(raw).trim();
}

export function normalizePathIdentifier(raw: string | null | undefined): string {
  return normalizePathSegment(raw);
}

export function extractPathIdentifier(
  pathname: string,
  pattern: RegExp,
): string {
  const match = pathname.match(pattern);
  return normalizePathIdentifier(match?.[1]);
}
