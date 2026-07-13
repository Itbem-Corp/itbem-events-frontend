import { cacheTokenHash } from "./tokenHash";
import { normalizeEventsUrl } from "./eventsUrl";
import { getPresignedUrlExpiry } from "./signedMedia";

export const SECTION_RESOURCE_CACHE_MAX_TTL_MS = 5 * 60 * 1000;
export const SECTION_RESOURCE_CACHE_FALLBACK_TTL_MS = 5 * 60 * 1000;
export const SECTION_RESOURCE_CACHE_REFRESH_SKEW_MS = 60 * 1000;
export const PUBLIC_ATTENDEES_CACHE_TTL_MS = 5 * 60 * 1000;

export interface CacheableSectionResource {
  view_url?: string;
  url?: string;
  view_url_expires_at?: string;
  viewUrl?: unknown;
  viewURL?: unknown;
  ViewURL?: unknown;
  ViewUrl?: unknown;
  URL?: unknown;
  viewUrlExpiresAt?: unknown;
  viewURLExpiresAt?: unknown;
  ViewURLExpiresAt?: unknown;
  ViewUrlExpiresAt?: unknown;
  expires_at?: unknown;
  expiresAt?: unknown;
  ExpiresAt?: unknown;
}

export interface PublicAccessCacheScopeInput {
  previewToken?: string | null;
  cacheKey?: string | number | null;
  invitationToken?: string | null;
  accessToken?: string | null;
}

export function publicAccessCacheScope({
  previewToken,
  cacheKey,
  invitationToken,
  accessToken,
}: PublicAccessCacheScopeInput): string {
  const preview = previewToken?.trim();
  if (preview) return `preview-${cacheTokenHash(preview)}`;

  const scopes: string[] = [];
  const version =
    cacheKey === undefined || cacheKey === null ? "" : String(cacheKey).trim();
  if (version) scopes.push(`v-${cacheTokenHash(version)}`);

  const invitation = invitationToken?.trim();
  if (invitation) scopes.push(`invite-${cacheTokenHash(invitation)}`);

  const access = accessToken?.trim();
  if (access) scopes.push(`access-${cacheTokenHash(access)}`);

  if (scopes.length) return scopes.join("-");

  return "public";
}

export function publicAccessScopedCacheKey(
  prefix: string,
  id: string,
  scope = "public",
  namespace = "",
): string {
  const namespacePart = publicAccessCacheNamespace(namespace);
  const base = namespacePart ? `${prefix}-${namespacePart}-${id}` : `${prefix}-${id}`;
  return scope === "public" ? base : `${base}-${scope}`;
}

export function sectionResourcesCacheKey(
  sectionId: string,
  scope = "public",
  namespace = "",
): string {
  return publicAccessScopedCacheKey("resourcesBySection", sectionId, scope, namespace);
}

export function sectionResourcesExpiryKey(
  sectionId: string,
  scope = "public",
  namespace = "",
): string {
  return publicAccessScopedCacheKey("resourcesExpiry", sectionId, scope, namespace);
}

export function publicAccessCacheNamespace(eventsUrl: string | null | undefined): string {
  if (!eventsUrl?.trim()) return "";
  const normalized = normalizeEventsUrl(eventsUrl).replace(/\/+$/, "");
  return normalized ? `api-${cacheTokenHash(normalized)}` : "";
}

export function getPresignedExpiry(viewUrl: string): Date | null {
  return getPresignedUrlExpiry(viewUrl);
}

function firstNonEmptyString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (trimmed) return trimmed;
  }
  return "";
}

function resourceViewUrl(resource: CacheableSectionResource): string {
  return firstNonEmptyString(
    resource.view_url,
    resource.viewUrl,
    resource.viewURL,
    resource.ViewURL,
    resource.ViewUrl,
    resource.url,
    resource.URL,
  );
}

function resourceViewUrlExpiresAt(resource: CacheableSectionResource): string {
  return firstNonEmptyString(
    resource.view_url_expires_at,
    resource.viewUrlExpiresAt,
    resource.viewURLExpiresAt,
    resource.ViewURLExpiresAt,
    resource.ViewUrlExpiresAt,
    resource.expires_at,
    resource.expiresAt,
    resource.ExpiresAt,
  );
}

export function getResourceViewUrlExpiry(
  resource: CacheableSectionResource,
): Date | null {
  const expiresAt = resourceViewUrlExpiresAt(resource);
  if (expiresAt) {
    const explicitExpiry = new Date(expiresAt);
    if (!Number.isNaN(explicitExpiry.getTime())) return explicitExpiry;
  }

  const viewUrl = resourceViewUrl(resource);
  return viewUrl ? getPresignedExpiry(viewUrl) : null;
}

export function getSectionResourcesCacheExpiry(
  resources: CacheableSectionResource[],
  now = new Date(),
): Date {
  const expirations = resources
    .map((r) => getResourceViewUrlExpiry(r))
    .filter((d): d is Date => d instanceof Date);

  const presignedExpiry = expirations.length
    ? new Date(Math.min(...expirations.map((d) => d.getTime())))
    : new Date(now.getTime() + SECTION_RESOURCE_CACHE_FALLBACK_TTL_MS);
  const maxFreshnessExpiry = new Date(
    now.getTime() + SECTION_RESOURCE_CACHE_MAX_TTL_MS,
  );

  return presignedExpiry < maxFreshnessExpiry
    ? presignedExpiry
    : maxFreshnessExpiry;
}

export function getSectionResourcesRefreshDelay(
  resources: CacheableSectionResource[],
  now = Date.now(),
  skewMs = SECTION_RESOURCE_CACHE_REFRESH_SKEW_MS,
): number | null {
  const expirations = resources
    .map((resource) => getResourceViewUrlExpiry(resource))
    .filter((expiry): expiry is Date => expiry instanceof Date);

  if (expirations.length === 0) return null;
  const earliest = Math.min(...expirations.map((expiry) => expiry.getTime()));
  return Math.max(0, earliest - now - skewMs);
}

export function sectionResourcesMediaRefreshKey(
  resources: CacheableSectionResource[],
): string {
  return resources
    .map((resource) =>
      [resourceViewUrl(resource), resourceViewUrlExpiresAt(resource)].join(":"),
    )
    .join("|");
}
