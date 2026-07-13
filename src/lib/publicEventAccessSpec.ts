import { fetchApiData } from "./apiFetch";
import { buildIdentifierPageSpecUrl } from "./pageSpecUrl";
import { publicAccessFetchInit } from "./publicPreview";

interface PublicEventAccessSpecRequest {
  eventsUrl: string;
  identifier: string;
  previewToken?: string | null;
  previewCacheKey?: string | null;
  sendCacheKey?: boolean | null;
  invitationToken?: string | null;
  accessToken?: string | null;
}

export function fetchPublicEventAccessSpec({
  eventsUrl,
  identifier,
  previewToken,
  previewCacheKey,
  sendCacheKey,
  invitationToken,
  accessToken,
}: PublicEventAccessSpecRequest): Promise<unknown> {
  return fetchApiData<unknown>(
    buildIdentifierPageSpecUrl(
      eventsUrl,
      identifier,
      previewToken,
      previewCacheKey,
      invitationToken,
      sendCacheKey,
    ),
    publicAccessFetchInit({
      previewToken,
      cacheKey: previewCacheKey,
      sendCacheKey,
      invitationToken,
      accessToken,
    }),
    "No se pudo cargar el evento",
  );
}
