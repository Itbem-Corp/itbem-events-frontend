"use client";

import { useEffect, useRef } from "react";
import { buildSectionResourcesUrl } from "../lib/apiUrls";
import { fetchApiData } from "../lib/apiFetch";
import { normalizeEventsUrl } from "../lib/eventsUrl";
import {
  normalizeSectionResourcesPayload,
  type SectionResource,
  type SectionResourcesPayload,
} from "../lib/publicResources";
import {
  getSectionResourcesCacheExpiry,
  getSectionResourcesRefreshDelay,
  publicAccessCacheScope,
  sectionResourcesCacheKey,
  sectionResourcesExpiryKey,
  sectionResourcesMediaRefreshKey,
} from "../lib/resourceCache";
import {
  publicAccessFetchInit,
  publicAccessQueryParams,
  resolvePublicAccessParams,
  type PublicAccessFetchParams,
} from "../lib/publicPreview";

export type Resource = SectionResource;
export type Section = SectionResourcesPayload;

interface Props {
  sectionId: string;
  EVENTS_URL: string;
  onLoaded: (section: Section) => void;
  publicAccess?: PublicAccessFetchParams;
}

export default function ResourcesBySectionSingle({
  sectionId,
  EVENTS_URL,
  onLoaded,
  publicAccess,
}: Props) {
  // Ref guard scoped to the concrete source. If sectionId/base URL changes,
  // resources are allowed to load again.
  const loadedKeyRef = useRef("");
  const refreshTimerRef = useRef<number | null>(null);
  const lastRefreshKeyRef = useRef<string | null>(null);
  const eventsUrl = normalizeEventsUrl(EVENTS_URL);

  useEffect(() => {
    const accessParams = resolvePublicAccessParams(
      publicAccess,
      window.location.search,
    );
    const accessScope = publicAccessCacheScope({
      previewToken: accessParams.previewToken,
      cacheKey: accessParams.cacheKey,
      invitationToken: accessParams.invitationToken,
      accessToken: accessParams.accessToken,
    });
    const loadedKey = `${eventsUrl}|${sectionId}|${accessScope}|${accessParams.cacheKey}`;
    if (loadedKeyRef.current === loadedKey) return;

    const controller = new AbortController();
    const cacheKey = sectionResourcesCacheKey(
      sectionId,
      accessScope,
      eventsUrl,
    );
    const expiryKey = sectionResourcesExpiryKey(
      sectionId,
      accessScope,
      eventsUrl,
    );
    const legacyCacheKey = sectionResourcesCacheKey(sectionId, accessScope);
    const legacyExpiryKey = sectionResourcesExpiryKey(sectionId, accessScope);
    const skipCache = accessParams.isPreview;

    const clearRefreshTimer = () => {
      if (refreshTimerRef.current !== null) {
        window.clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
    };

    const scheduleMediaRefresh = (section: Section) => {
      clearRefreshTimer();
      const refreshDelay = getSectionResourcesRefreshDelay(
        section.sectionResources,
      );
      const refreshKey = sectionResourcesMediaRefreshKey(
        section.sectionResources,
      );
      if (refreshDelay === null || !refreshKey) return;

      const refreshResources = () => {
        lastRefreshKeyRef.current = refreshKey;
        void loadResources(true);
      };

      if (refreshDelay <= 0) {
        if (lastRefreshKeyRef.current === refreshKey) return;
        refreshResources();
        return;
      }

      refreshTimerRef.current = window.setTimeout(
        refreshResources,
        refreshDelay,
      );
    };

    const loadResources = async (forceNetwork = false) => {
      const now = new Date();

      if (!skipCache && !forceNetwork) {
        try {
          if (legacyCacheKey !== cacheKey)
            sessionStorage.removeItem(legacyCacheKey);
          if (legacyExpiryKey !== expiryKey)
            localStorage.removeItem(legacyExpiryKey);

          const cachedExpiry = localStorage.getItem(expiryKey);
          if (cachedExpiry) {
            const expiryDate = new Date(cachedExpiry);
            if (expiryDate > now) {
              const cached = sessionStorage.getItem(cacheKey);
              if (cached) {
                try {
                  const parsed = JSON.parse(cached);
                  const section = normalizeSectionResourcesPayload(
                    parsed,
                    sectionId,
                    eventsUrl,
                  );
                  loadedKeyRef.current = loadedKey;
                  onLoaded(section);
                  scheduleMediaRefresh(section);
                  return;
                } catch {
                  // Corrupt cache - fall through to fetch.
                }
              }
            }
            sessionStorage.removeItem(cacheKey);
            localStorage.removeItem(expiryKey);
          }
        } catch {
          // Storage unavailable - fetch normally without cache.
        }
      }

      try {
        const payload = await fetchApiData<unknown>(
          buildSectionResourcesUrl(
            eventsUrl,
            sectionId,
            publicAccessQueryParams(accessParams),
          ),
          publicAccessFetchInit(accessParams, {
            signal: controller.signal,
          }),
          `API error loading section ${sectionId}`,
        );
        const section = normalizeSectionResourcesPayload(
          payload,
          sectionId,
          eventsUrl,
        );

        if (!skipCache) {
          try {
            const expiry = getSectionResourcesCacheExpiry(
              section.sectionResources,
              now,
            );
            sessionStorage.setItem(cacheKey, JSON.stringify(section));
            localStorage.setItem(expiryKey, expiry.toISOString());
          } catch {
            // Storage full or unavailable - render without cache.
          }
        }

        loadedKeyRef.current = loadedKey;
        onLoaded(section);
        scheduleMediaRefresh(section);
      } catch (err: unknown) {
        if (err instanceof Error && err.name === "AbortError") return;
        console.error(`Error loading section ${sectionId}:`, err);
      }
    };

    loadResources();

    return () => {
      controller.abort();
      clearRefreshTimer();
    };
  }, [
    sectionId,
    eventsUrl,
    publicAccess?.previewToken,
    publicAccess?.cacheKey,
    publicAccess?.sendCacheKey,
    publicAccess?.invitationToken,
    publicAccess?.accessToken,
  ]);

  return null;
}
