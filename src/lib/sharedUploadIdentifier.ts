import { extractPathIdentifier, normalizePathIdentifier } from "./pathIdentifier";
import { publicAccessLinkQueryParams } from "./publicPreview";
import { publicQueryParams } from "./publicQueryParams";

export interface PublicPreviewLinkParams {
  previewToken?: string | null;
  cacheKey?: string | number | null;
  invitationToken?: string | null;
  accessToken?: string | null;
}

function parseQueryIdentifier(search: string): string {
  const params = publicQueryParams(search);
  return normalizePathIdentifier(params.get("e") ?? params.get("identifier"));
}

export function getSharedUploadIdentifier(
  pathname: string,
  search = "",
): string {
  const pathIdentifier = extractPathIdentifier(
    pathname,
    /\/events\/([^/]+)\/upload/,
  );
  if (pathIdentifier) return pathIdentifier;
  return parseQueryIdentifier(search);
}

export function buildSharedUploadPageUrl(
  baseUrl: string,
  identifier: string,
  preview?: PublicPreviewLinkParams,
): string {
  const cleanBaseUrl = baseUrl.trim().replace(/\/+$/, "");
  const cleanIdentifier = encodeURIComponent(normalizePathIdentifier(identifier));
  const path = `${cleanBaseUrl}/events/${cleanIdentifier}/upload`;
  const params = new URLSearchParams();
  applyPublicPreviewParams(params, preview);
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}

function applyPublicPreviewParams(
  params: URLSearchParams,
  preview?: PublicPreviewLinkParams,
): void {
  for (const [key, value] of Object.entries(publicAccessLinkQueryParams(preview ?? {}))) {
    if (value) {
      params.set(key, value);
    }
  }
}

export function buildEventMomentsPath(
  identifier: string,
  baseUrlOrPath = "",
  preview?: PublicPreviewLinkParams,
): string {
  const cleanBase = baseUrlOrPath.trim().replace(/\/+$/, "");
  const path = `${cleanBase}/e/${encodeURIComponent(normalizePathIdentifier(identifier))}/momentos`;
  const params = new URLSearchParams();
  applyPublicPreviewParams(params, preview);
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}
