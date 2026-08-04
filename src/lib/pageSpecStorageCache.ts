import type { PageSpec } from "../components/engine/types";
import { getPresignedUrlExpiry } from "./signedMedia";
import { cacheTokenHash } from "./tokenHash";

export type PageSpecCacheMode = "token" | "identifier";

export const TOKEN_PAGE_SPEC_CACHE_TTL_MS = 5 * 60 * 1000;
export const IDENTIFIER_PAGE_SPEC_CACHE_TTL_MS = 30 * 1000;
export const PAGE_SPEC_SIGNED_MEDIA_CACHE_SKEW_MS = 60 * 1000;

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

interface CachedPageSpec {
  spec: PageSpec;
  ts: number;
}

function isCachedPageSpec(value: unknown): value is PageSpec {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as { meta?: unknown; sections?: unknown };
  return (
    !!candidate.meta &&
    typeof candidate.meta === "object" &&
    !Array.isArray(candidate.meta) &&
    Array.isArray(candidate.sections)
  );
}

function preparePageSpecForCache(spec: PageSpec): PageSpec {
  return {
    ...spec,
    sections: spec.sections.map((section) => {
      if (typeof section.config !== "string") return section;
      try {
        const parsed = JSON.parse(section.config);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          return { ...section, config: parsed as Record<string, unknown> };
        }
      } catch {
        // Keep malformed historic cache values for the section boundary.
      }
      return section;
    }),
  };
}

export function getPageSpecCacheTtlMs(mode: PageSpecCacheMode): number {
  return mode === "identifier"
    ? IDENTIFIER_PAGE_SPEC_CACHE_TTL_MS
    : TOKEN_PAGE_SPEC_CACHE_TTL_MS;
}

function earliestDate(dates: Array<Date | null | undefined>): Date | null {
  let earliest: Date | null = null;
  for (const date of dates) {
    if (!date || !Number.isFinite(date.getTime())) continue;
    if (!earliest || date.getTime() < earliest.getTime()) earliest = date;
  }
  return earliest;
}

function optionalDate(value: string | undefined): Date | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function getPageSpecCoverExpiry(spec: PageSpec): Date | null {
  return earliestDate([
    optionalDate(spec.meta.coverViewUrlExpiresAt || spec.meta.coverImageUrlExpiresAt),
    getPresignedUrlExpiry(spec.meta.coverViewUrl || spec.meta.coverImageUrl),
    ...(spec.meta.coverVariants ?? []).map(
      (variant) =>
        optionalDate(variant.viewUrlExpiresAt) ??
        getPresignedUrlExpiry(variant.viewUrl || variant.url),
    ),
  ]);
}

export function getPageSpecThemeFontExpiry(spec: PageSpec): Date | null {
  const urls = {
    ...(spec.meta.theme?.fontUrls ?? {}),
    ...(spec.meta.theme?.fontViewUrls ?? {}),
  };
  return earliestDate([
    optionalDate(spec.meta.theme?.fontViewUrlsExpiresAt),
    ...Object.values(urls).map((url) => getPresignedUrlExpiry(url)),
  ]);
}

export function getPageSpecCacheExpiresAt(spec: PageSpec, mode: PageSpecCacheMode, cachedAt: number): number {
  const ttlExpiresAt = cachedAt + getPageSpecCacheTtlMs(mode);
  const signedMediaExpiresAt = earliestDate([
    getPageSpecCoverExpiry(spec),
    getPageSpecThemeFontExpiry(spec),
  ])?.getTime();
  if (!signedMediaExpiresAt || !Number.isFinite(signedMediaExpiresAt)) return ttlExpiresAt;
  return Math.min(ttlExpiresAt, signedMediaExpiresAt - PAGE_SPEC_SIGNED_MEDIA_CACHE_SKEW_MS);
}

export function shouldRenderPageSpecCacheBeforeRevalidate(mode: PageSpecCacheMode, hasInvitationToken = false): boolean {
  return mode === "token" || hasInvitationToken;
}

export function shouldRenderCachedPageSpecBeforeRevalidate(mode: PageSpecCacheMode, spec: PageSpec, hasInvitationToken = false): boolean {
  return shouldRenderPageSpecCacheBeforeRevalidate(mode, hasInvitationToken) &&
    spec.meta.access?.passwordProtected === true &&
    spec.meta.access.passwordVerified !== true &&
    spec.meta.access.previewAuthorized !== true;
}

export function pageSpecCacheKey(cacheId: string, mode: PageSpecCacheMode, namespace = ""): string {
  const cleanNamespace = namespace.trim();
  const hashedCacheId = cacheTokenHash(cacheId);
  return cleanNamespace
    ? `pageSpec-${mode}-${encodeURIComponent(cleanNamespace)}-${hashedCacheId}`
    : `pageSpec-${mode}-${hashedCacheId}`;
}

function resolveStorage(storage?: StorageLike): StorageLike | null {
  if (storage) return storage;
  return typeof sessionStorage === "undefined" ? null : sessionStorage;
}

export function readPageSpecCache(cacheId: string, mode: PageSpecCacheMode, storage?: StorageLike, now = Date.now(), namespace = ""): PageSpec | null {
  const resolvedStorage = resolveStorage(storage);
  if (!resolvedStorage) return null;
  const key = pageSpecCacheKey(cacheId, mode, namespace);
  try {
    const raw = resolvedStorage.getItem(key);
    if (!raw) return null;
    const cached = JSON.parse(raw) as Partial<CachedPageSpec>;
    if (!cached.spec || typeof cached.ts !== "number" || !isCachedPageSpec(cached.spec) || now > getPageSpecCacheExpiresAt(cached.spec, mode, cached.ts)) {
      resolvedStorage.removeItem(key);
      return null;
    }
    return cached.spec;
  } catch {
    resolvedStorage.removeItem(key);
    return null;
  }
}

export function writePageSpecCache(cacheId: string, spec: PageSpec, mode: PageSpecCacheMode, storage?: StorageLike, now = Date.now(), namespace = "") {
  const resolvedStorage = resolveStorage(storage);
  if (!resolvedStorage) return;
  try {
    resolvedStorage.setItem(pageSpecCacheKey(cacheId, mode, namespace), JSON.stringify({ spec: preparePageSpecForCache(spec), ts: now }));
  } catch {
    // Storage is best-effort only.
  }
}

export function removePageSpecCache(cacheId: string, mode: PageSpecCacheMode, storage?: StorageLike, namespace = "") {
  const resolvedStorage = resolveStorage(storage);
  if (resolvedStorage) resolvedStorage.removeItem(pageSpecCacheKey(cacheId, mode, namespace));
}
