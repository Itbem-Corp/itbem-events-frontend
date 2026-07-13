import { normalizeEventsUrl } from "./eventsUrl";
import {
  normalizePathIdentifier,
  normalizePathSegment,
} from "./pathIdentifier";
import {
  PUBLIC_INVITATION_TOKEN_QUERY_KEYS,
  PUBLIC_PREVIEW_TOKEN_QUERY_KEYS,
} from "./publicAccessParams";
import { publicAccessQueryParams } from "./publicPreview";

type QueryValue = string | number | boolean | null | undefined;
type EventMomentsQuery = Record<string, QueryValue>;

const PUBLIC_INVITATION_TOKEN_QUERY_KEY =
  PUBLIC_INVITATION_TOKEN_QUERY_KEYS[0];
const PUBLIC_PREVIEW_TOKEN_QUERY_KEY = PUBLIC_PREVIEW_TOKEN_QUERY_KEYS[0];

function keepsEmptyQueryValue(key: string): boolean {
  return key === "cursor";
}

export function buildApiUrl(
  eventsUrl: string,
  path: string,
  query?: Record<string, QueryValue>,
): string {
  const cleanPath = path.replace(/^\/+/, "");
  const url = new URL(cleanPath, normalizeEventsUrl(eventsUrl));

  if (query) {
    for (const [key, value] of Object.entries(query)) {
      const isEmptyString = value === "";
      if (value === undefined || value === null) continue;
      if (isEmptyString && !keepsEmptyQueryValue(key)) continue;
      url.searchParams.set(key, String(value));
    }
  }

  return url.toString();
}

export function buildEventApiUrl(
  eventsUrl: string,
  identifier: string,
  suffix = "",
  query?: Record<string, QueryValue>,
): string {
  const cleanSuffix = suffix.replace(/^\/+/, "").replace(/\/+$/, "");
  const cleanIdentifier = normalizePathIdentifier(identifier);
  return buildApiUrl(
    eventsUrl,
    `api/events/${encodeURIComponent(cleanIdentifier)}${cleanSuffix ? `/${cleanSuffix}` : ""}`,
    query,
  );
}

export function buildInvitationByTokenUrl(
  eventsUrl: string,
  token: string,
): string {
  return buildApiUrl(eventsUrl, "api/invitations/ByToken", {
    [PUBLIC_INVITATION_TOKEN_QUERY_KEY]: token.trim(),
  });
}

export function buildRsvpUrl(eventsUrl: string): string {
  return buildApiUrl(eventsUrl, "api/invitations/rsvp");
}

export function buildEventMetaUrl(
  eventsUrl: string,
  identifier: string,
  previewToken?: string,
  previewCacheKey?: string,
  invitationToken?: string,
): string {
  return buildEventApiUrl(eventsUrl, identifier, "meta", {
    ...publicAccessQueryParams({
      cacheKey: previewCacheKey,
      previewToken,
      invitationToken,
    }),
  });
}

export function buildEventVerifyAccessUrl(
  eventsUrl: string,
  identifier: string,
  invitationToken?: string | null,
  previewToken?: string | null,
): string {
  return buildEventApiUrl(eventsUrl, identifier, "verify-access", {
    [PUBLIC_INVITATION_TOKEN_QUERY_KEY]: invitationToken?.trim(),
    [PUBLIC_PREVIEW_TOKEN_QUERY_KEY]: previewToken?.trim(),
  });
}

export function buildTrackViewUrl(
  eventsUrl: string,
  identifier: string,
  invitationToken?: string | null,
): string {
  return buildEventApiUrl(eventsUrl, identifier, "view", {
    [PUBLIC_INVITATION_TOKEN_QUERY_KEY]: invitationToken?.trim(),
  });
}

export function buildEventMomentsUrl(
  eventsUrl: string,
  identifier: string,
  query?: EventMomentsQuery,
): string {
  return buildEventApiUrl(eventsUrl, identifier, "moments", query);
}

export function buildEventPhrasesUrl(
  eventsUrl: string,
  type: string,
  count: number,
): string {
  return buildApiUrl(eventsUrl, "api/events/phrases", { type, count });
}

export function buildPersonalMomentCreateUrl(
  eventsUrl: string,
  identifier: string,
): string {
  return buildEventApiUrl(eventsUrl, identifier, "moments");
}

export function buildPersonalMomentUploadUrl(
  eventsUrl: string,
  identifier: string,
): string {
  return buildEventApiUrl(eventsUrl, identifier, "moments/upload-url");
}

export function buildPersonalMomentConfirmUrl(
  eventsUrl: string,
  identifier: string,
): string {
  return buildEventApiUrl(eventsUrl, identifier, "moments/confirm");
}

export function buildSharedMomentCreateUrl(
  eventsUrl: string,
  identifier: string,
  query?: Record<string, QueryValue>,
): string {
  return buildEventApiUrl(eventsUrl, identifier, "moments/shared", query);
}

export function buildSharedMomentUploadUrl(
  eventsUrl: string,
  identifier: string,
  query?: Record<string, QueryValue>,
): string {
  return buildEventApiUrl(
    eventsUrl,
    identifier,
    "moments/shared/upload-url",
    query,
  );
}

export function buildSharedMomentBatchUploadUrlsUrl(
  eventsUrl: string,
  identifier: string,
  query?: Record<string, QueryValue>,
): string {
  return buildEventApiUrl(
    eventsUrl,
    identifier,
    "moments/shared/batch-upload-urls",
    query,
  );
}

export function buildSharedMomentConfirmUrl(
  eventsUrl: string,
  identifier: string,
  query?: Record<string, QueryValue>,
): string {
  return buildEventApiUrl(
    eventsUrl,
    identifier,
    "moments/shared/confirm",
    query,
  );
}

export function buildSharedMultipartStartUrl(
  eventsUrl: string,
  identifier: string,
  query?: Record<string, QueryValue>,
): string {
  return buildEventApiUrl(
    eventsUrl,
    identifier,
    "moments/shared/multipart/start",
    query,
  );
}

export function buildSharedMultipartAbortUrl(
  eventsUrl: string,
  identifier: string,
  query?: Record<string, QueryValue>,
): string {
  return buildEventApiUrl(
    eventsUrl,
    identifier,
    "moments/shared/multipart/abort",
    query,
  );
}

export function buildSharedMultipartCompleteUrl(
  eventsUrl: string,
  identifier: string,
  query?: Record<string, QueryValue>,
): string {
  return buildEventApiUrl(
    eventsUrl,
    identifier,
    "moments/shared/multipart/complete",
    query,
  );
}

export function buildSectionResourcesUrl(
  eventsUrl: string,
  sectionId: string,
  query?: Record<string, QueryValue>,
): string {
  const cleanSectionId = normalizePathSegment(sectionId);
  return buildApiUrl(
    eventsUrl,
    `api/resources/section/${encodeURIComponent(cleanSectionId)}`,
    query,
  );
}

export function buildResourceUrl(
  eventsUrl: string,
  resourceId: string,
  query?: Record<string, QueryValue>,
): string {
  const cleanResourceId = normalizePathSegment(resourceId);
  return buildApiUrl(
    eventsUrl,
    `api/resources/${encodeURIComponent(cleanResourceId)}`,
    query,
  );
}

export function buildSectionAttendeesUrl(
  eventsUrl: string,
  sectionId: string,
  query?: Record<string, QueryValue>,
): string {
  const cleanSectionId = normalizePathSegment(sectionId);
  return buildApiUrl(
    eventsUrl,
    `api/events/section/${encodeURIComponent(cleanSectionId)}/attendees`,
    query,
  );
}
