import { buildApiUrl, buildEventApiUrl } from "./apiUrls";
import { PUBLIC_INVITATION_TOKEN_QUERY_KEYS } from "./publicAccessParams";
import { publicAccessQueryParams } from "./publicPreview";

const PUBLIC_INVITATION_TOKEN_QUERY_KEY =
  PUBLIC_INVITATION_TOKEN_QUERY_KEYS[0];

export function buildIdentifierPageSpecUrl(
  eventsUrl: string,
  identifier: string,
  previewToken?: string | null,
  previewCacheKey?: string | null,
  invitationToken?: string | null,
  sendCacheKey?: boolean | null,
): string {
  const cleanPreviewToken = previewToken?.trim();
  return buildEventApiUrl(eventsUrl, identifier, "page-spec", {
    ...publicAccessQueryParams({
      cacheKey: previewCacheKey,
      sendCacheKey,
      previewToken: cleanPreviewToken,
      invitationToken,
    }),
  });
}

export function buildTokenPageSpecUrl(
  eventsUrl: string,
  token: string,
): string {
  return buildApiUrl(eventsUrl, "api/events/page-spec", {
    [PUBLIC_INVITATION_TOKEN_QUERY_KEY]: token.trim(),
  });
}
