"use client";
import { useEffect, useRef } from "react";
import {
  normalizeInvitationPayload,
  type InvitationData,
} from "../lib/invitationData";
import { normalizeEventsUrl } from "../lib/eventsUrl";
import { buildInvitationByTokenUrl } from "../lib/apiUrls";
import { fetchApiData } from "../lib/apiFetch";
import { buildInvitationLoadKey } from "../lib/invitationLoadKey";
import {
  publicAccessFetchInit,
  resolvePublicAccessParams,
  type PublicAccessFetchParams,
  type ResolvedPublicAccessParams,
} from "../lib/publicPreview";

export type { InvitationData };

export function resolveInvitationLoaderPublicAccess(
  token: string,
  publicAccess?: PublicAccessFetchParams,
  search?: string,
): ResolvedPublicAccessParams {
  const accessParams = resolvePublicAccessParams(publicAccess, search);
  return {
    ...accessParams,
    invitationToken: accessParams.invitationToken || token.trim(),
  };
}

interface Props {
  token: string;
  EVENTS_URL: string;
  publicAccess?: PublicAccessFetchParams;
  onLoaded: (data: InvitationData) => void;
  onError?: (message: string) => void;
}

export default function InvitationLoader({
  token,
  EVENTS_URL,
  publicAccess,
  onLoaded,
  onError,
}: Props) {
  // Ref guard: prevents duplicate fetches for the same backend/token pair.
  const loadedKeyRef = useRef("");
  const eventsUrl = normalizeEventsUrl(EVENTS_URL);
  const cleanToken = token.trim();
  const accessParams = resolveInvitationLoaderPublicAccess(
    cleanToken,
    publicAccess,
  );
  const previewToken = accessParams.previewToken;
  const cacheKey = accessParams.cacheKey;
  const sendCacheKey = Boolean(accessParams.sendCacheKey);
  const invitationToken = accessParams.invitationToken;
  const accessToken = accessParams.accessToken;
  const loadKey = [
    buildInvitationLoadKey(eventsUrl, cleanToken),
    previewToken,
    cacheKey,
    sendCacheKey,
    invitationToken,
    accessToken,
  ].join("\0");

  useEffect(() => {
    if (!loadKey || loadedKeyRef.current === loadKey) return;

    const controller = new AbortController();

    const loadInvitation = async () => {
      try {
        const payload = await fetchApiData<unknown>(
          buildInvitationByTokenUrl(eventsUrl, cleanToken),
          publicAccessFetchInit(
            {
              previewToken,
              cacheKey,
              sendCacheKey,
              invitationToken,
              accessToken,
            },
            { signal: controller.signal },
          ),
        );
        const data = normalizeInvitationPayload(payload, cleanToken);

        loadedKeyRef.current = loadKey;
        onLoaded(data);
      } catch (err: unknown) {
        if (err instanceof Error && err.name === "AbortError") return;
        const message =
          err instanceof Error ? err.message : "Error cargando invitación";
        console.error("Error loading invitation:", err);
        onError?.(message);
      }
    };

    loadInvitation();

    // Cleanup: cancela la petición si el componente se desmonta antes de terminar
    return () => {
      controller.abort();
    };
  }, [
    accessToken,
    cacheKey,
    cleanToken,
    eventsUrl,
    invitationToken,
    loadKey,
    previewToken,
    sendCacheKey,
  ]); // onLoaded/onError excluded: stable setters/handlers.

  return null;
}
