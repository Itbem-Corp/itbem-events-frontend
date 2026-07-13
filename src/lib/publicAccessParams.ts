export const PUBLIC_PREVIEW_MODE_QUERY_KEY = "preview";
export const PUBLIC_PREVIEW_CACHE_KEY_QUERY_KEY = "t";

export const PUBLIC_PREVIEW_TOKEN_QUERY_KEYS = [
  "preview_token",
  "previewToken",
  "PreviewToken",
] as const;

export const PUBLIC_INVITATION_TOKEN_QUERY_KEYS = [
  "token",
  "Token",
  "invitation_token",
  "invitationToken",
  "InvitationToken",
  "pretty_token",
  "prettyToken",
  "PrettyToken",
] as const;

export const PUBLIC_EVENT_ACCESS_TOKEN_QUERY_KEYS = [
  "event_access_token",
  "eventAccessToken",
  "EventAccessToken",
  "access_token",
  "accessToken",
  "AccessToken",
] as const;

export const PUBLIC_ACCESS_CREDENTIAL_QUERY_KEYS = [
  ...PUBLIC_PREVIEW_TOKEN_QUERY_KEYS,
  ...PUBLIC_INVITATION_TOKEN_QUERY_KEYS,
  ...PUBLIC_EVENT_ACCESS_TOKEN_QUERY_KEYS,
] as const;

export function hasPublicAccessCredential(searchParams: URLSearchParams): boolean {
  return PUBLIC_ACCESS_CREDENTIAL_QUERY_KEYS.some((key) => searchParams.has(key));
}

export const PUBLIC_ACCESS_DISPLAY_QUERY_KEYS = [
  PUBLIC_PREVIEW_MODE_QUERY_KEY,
  PUBLIC_PREVIEW_CACHE_KEY_QUERY_KEY,
  ...PUBLIC_ACCESS_CREDENTIAL_QUERY_KEYS,
] as const;

export const PUBLIC_EVENT_ACCESS_HEADER_NAME = "X-Event-Access-Token";
