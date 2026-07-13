import {
  PUBLIC_EVENT_ACCESS_TOKEN_QUERY_KEYS,
  PUBLIC_INVITATION_TOKEN_QUERY_KEYS,
  PUBLIC_PREVIEW_CACHE_KEY_QUERY_KEY,
  PUBLIC_PREVIEW_MODE_QUERY_KEY,
  PUBLIC_PREVIEW_TOKEN_QUERY_KEYS,
} from "./publicAccessParams";

function hasAnyParam(
  searchParams: URLSearchParams,
  names: readonly string[],
): boolean {
  return names.some((name) => searchParams.has(name));
}

export function sanitizePublicShareUrl(rawUrl: string): string {
  let url: URL;

  try {
    url = new URL(rawUrl);
  } catch {
    return rawUrl;
  }

  const hadPreviewScope =
    url.searchParams.has(PUBLIC_PREVIEW_MODE_QUERY_KEY) ||
    hasAnyParam(url.searchParams, PUBLIC_PREVIEW_TOKEN_QUERY_KEYS);

  url.searchParams.delete(PUBLIC_PREVIEW_MODE_QUERY_KEY);
  PUBLIC_PREVIEW_TOKEN_QUERY_KEYS.forEach((name) =>
    url.searchParams.delete(name),
  );
  PUBLIC_EVENT_ACCESS_TOKEN_QUERY_KEYS.forEach((name) =>
    url.searchParams.delete(name),
  );
  PUBLIC_INVITATION_TOKEN_QUERY_KEYS.forEach((name) =>
    url.searchParams.delete(name),
  );

  if (hadPreviewScope) {
    url.searchParams.delete(PUBLIC_PREVIEW_CACHE_KEY_QUERY_KEY);
  }

  return url.toString();
}

/**
 * Returns a token-free URL that is still usable by its recipient. Token-only
 * invitation routes become the event's canonical public route when the page
 * spec exposes an identifier.
 */
export function buildPublicShareUrl(
  rawUrl: string,
  eventIdentifier?: string,
): string {
  const identifier = eventIdentifier?.trim();

  if (!identifier) return sanitizePublicShareUrl(rawUrl);

  try {
    const url = new URL(rawUrl);
    url.pathname = `/e/${encodeURIComponent(identifier)}`;
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return sanitizePublicShareUrl(rawUrl);
  }
}
