function normalizePathSegment(value: string): string {
  const raw = value.trim();
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export function buildPublicRsvpUrl(
  origin: string,
  token: string,
  identifier?: string | null,
): string {
  const baseUrl = origin.trim().replace(/\/+$/, "");
  const cleanIdentifier = identifier?.trim();
  const path = cleanIdentifier
    ? `/rsvp/${encodeURIComponent(normalizePathSegment(cleanIdentifier))}`
    : "/evento";
  return `${baseUrl}${path}?token=${encodeURIComponent(token.trim())}`;
}

export function publicBaseUrlFromEventoPath(
  origin: string,
  pathname: string,
): string {
  const cleanOrigin = origin.trim().replace(/\/+$/, "");
  const cleanPathname = pathname.trim();
  const match =
    cleanPathname.match(/^(.*?)\/evento\/?$/) ??
    cleanPathname.match(/^(.*?)\/rsvp\/[^/]+\/?$/) ??
    cleanPathname.match(/^(.*?)\/e\/[^/]+\/?$/);
  return `${cleanOrigin}${match?.[1] ?? ""}`;
}

export function publicRsvpIdentifierFromPath(pathname: string): string {
  const match =
    pathname.trim().match(/\/rsvp\/([^/]+)\/?$/) ??
    pathname.trim().match(/\/e\/([^/]+)\/?$/);
  if (!match) return "";
  return normalizePathSegment(match[1]);
}

export interface PublicLocationLike {
  origin?: string;
  pathname?: string;
}

export function publicBaseUrlFromLocation(
  location: PublicLocationLike | null | undefined,
): string {
  const origin = location?.origin?.trim();
  const pathname = location?.pathname ?? "";
  if (!origin) return "";
  return publicBaseUrlFromEventoPath(origin, pathname);
}

export function publicRsvpIdentifierFromLocation(
  location: PublicLocationLike | null | undefined,
): string {
  return publicRsvpIdentifierFromPath(location?.pathname ?? "");
}
