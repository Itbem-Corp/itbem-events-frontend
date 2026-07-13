const DEFAULT_EVENTS_URLS = [
  "https://api.eventiapp.com.mx/",
  "http://localhost:8080/",
];

const SENSITIVE_PUBLIC_ACCESS_QUERY_KEYS = [
  "token",
  "Token",
  "pretty_token",
  "prettyToken",
  "PrettyToken",
  "invitation_token",
  "invitationToken",
  "InvitationToken",
  "preview_token",
  "previewToken",
  "PreviewToken",
  "event_access_token",
  "eventAccessToken",
  "EventAccessToken",
];

const SENSITIVE_PUBLIC_ACCESS_HEADERS = ["x-event-access-token"];

const SIGNED_MEDIA_QUERY_KEYS = [
  "X-Amz-Algorithm",
  "X-Amz-Credential",
  "X-Amz-Date",
  "X-Amz-Expires",
  "X-Amz-Security-Token",
  "X-Amz-Signature",
  "X-Amz-SignedHeaders",
  "AWSAccessKeyId",
  "Expires",
  "Signature",
  "Policy",
  "Key-Pair-Id",
];

const S3_VIDEO_MEDIA_PATH_PATTERN = /\.(?:mp4|webm|mov|m4v|3gp)$/i;

export const PUBLIC_ACCESS_CONTENT_API_PATH_PATTERN =
  /^\/api\/(?:events\/page-spec|events\/[^/]+\/(?:page-spec|moments)|invitations\/ByToken(?:\/[^/]+)?|resources\/(?:section\/[^/]+|[^/]+)|events\/section\/[^/]+\/attendees)$/;

export const FRESH_FIRST_API_PATH_PATTERN = /^\/api\/events\/[^/]+\/meta$/;

export const PUBLIC_EVENT_PAGE_PATH_PATTERN = /(?:^|\/)(?:e|rsvp)\//;

function normalizeEventsUrl(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  return `${raw.replace(/\/+$/, "").replace(/\/api$/i, "")}/`;
}

function parseEventsBase(value) {
  const normalized = normalizeEventsUrl(value);
  if (!normalized) return null;
  try {
    return new URL(normalized);
  } catch {
    return null;
  }
}

function apiBases(eventsUrl) {
  const bases = [...DEFAULT_EVENTS_URLS, eventsUrl]
    .map(parseEventsBase)
    .filter(Boolean);
  const seen = new Set();
  return bases.filter((base) => {
    const key = `${base.origin}${base.pathname}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function parseUrl(value) {
  if (value instanceof URL) return value;
  try {
    return new URL(String(value ?? ""));
  } catch {
    return null;
  }
}

function apiPathForBase(url, base) {
  if (url.origin !== base.origin) return "";
  const basePath = base.pathname.endsWith("/")
    ? base.pathname
    : `${base.pathname}/`;
  if (basePath === "/") return url.pathname;
  if (!url.pathname.startsWith(basePath)) return "";
  return `/${url.pathname.slice(basePath.length)}`;
}

function matchesApiBase(url, base) {
  return apiPathForBase(url, base).startsWith("/api/");
}

function hasSensitivePublicAccessQuery(url) {
  return SENSITIVE_PUBLIC_ACCESS_QUERY_KEYS.some((key) => {
    const value = url.searchParams.get(key);
    return typeof value === "string" && value.trim() !== "";
  });
}

function hasSensitivePublicAccessPath(url, base) {
  return /^\/api\/invitations\/ByToken\/[^/]+$/.test(apiPathForBase(url, base));
}

function hasPublicAccessControlledPath(url, base) {
  return PUBLIC_ACCESS_CONTENT_API_PATH_PATTERN.test(apiPathForBase(url, base));
}

function headerValue(request, key) {
  const headers = request?.headers;
  if (!headers) return "";
  if (typeof headers.get === "function") return headers.get(key) ?? "";
  const direct =
    headers[key] ?? headers[key.toLowerCase()] ?? headers[key.toUpperCase()];
  if (Array.isArray(direct)) return direct.join(",");
  return String(direct ?? "");
}

function hasSensitivePublicAccessHeader(request) {
  return SENSITIVE_PUBLIC_ACCESS_HEADERS.some(
    (key) => headerValue(request, key).trim() !== "",
  );
}

function hasSensitivePublicAccess(url, base, request) {
  return (
    hasPublicAccessControlledPath(url, base) ||
    hasSensitivePublicAccessQuery(url) ||
    hasSensitivePublicAccessPath(url, base) ||
    hasSensitivePublicAccessHeader(request)
  );
}

function hasSignedMediaQuery(url) {
  return SIGNED_MEDIA_QUERY_KEYS.some((key) => {
    const value = url.searchParams.get(key);
    return typeof value === "string" && value.trim() !== "";
  });
}

function matchesFreshFirstApiPath(url, base) {
  return FRESH_FIRST_API_PATH_PATTERN.test(apiPathForBase(url, base));
}

export function shouldBypassApiRuntimeCache(url, eventsUrl, request) {
  const parsed = parseUrl(url);
  if (!parsed) return false;
  return apiBases(eventsUrl).some(
    (base) =>
      matchesApiBase(parsed, base) &&
      hasSensitivePublicAccess(parsed, base, request),
  );
}

export function shouldUseApiRuntimeCache(url, eventsUrl, request) {
  const parsed = parseUrl(url);
  if (!parsed) return false;
  return apiBases(eventsUrl).some(
    (base) =>
      matchesApiBase(parsed, base) &&
      !matchesFreshFirstApiPath(parsed, base) &&
      !hasSensitivePublicAccess(parsed, base, request),
  );
}

function isCacheableApiMethod(method) {
  return !method || String(method).toUpperCase() === "GET";
}

export function shouldUseFreshFirstApiCache(
  url,
  eventsUrl,
  method = "GET",
  request,
) {
  if (!isCacheableApiMethod(method)) return false;
  const parsed = parseUrl(url);
  if (!parsed) return false;
  return apiBases(eventsUrl).some(
    (base) =>
      matchesFreshFirstApiPath(parsed, base) &&
      !hasSensitivePublicAccess(parsed, base, request),
  );
}

export function createFreshFirstApiMatcher(eventsUrl) {
  return ({ request, url }) =>
    shouldUseFreshFirstApiCache(url, eventsUrl, request?.method, request);
}

export function createApiRuntimeCacheMatcher(eventsUrl) {
  return ({ request, url }) =>
    isCacheableApiMethod(request?.method) &&
    shouldUseApiRuntimeCache(url, eventsUrl, request);
}

export function shouldUsePublicEventPageRuntimeCache(url, request) {
  const parsed = parseUrl(url);
  if (!parsed) return false;
  return (
    request?.mode === "navigate" &&
    PUBLIC_EVENT_PAGE_PATH_PATTERN.test(parsed.pathname) &&
    !hasSensitivePublicAccessQuery(parsed)
  );
}

export function createPublicEventPageRuntimeCacheMatcher() {
  return ({ request, url }) =>
    shouldUsePublicEventPageRuntimeCache(url, request);
}

export function shouldUseS3ImageRuntimeCache(url) {
  const parsed = parseUrl(url);
  if (!parsed) return false;
  return (
    parsed.hostname.includes("amazonaws.com") &&
    !S3_VIDEO_MEDIA_PATH_PATTERN.test(parsed.pathname) &&
    !hasSignedMediaQuery(parsed)
  );
}

export function createS3ImageRuntimeCacheMatcher() {
  return ({ url }) => shouldUseS3ImageRuntimeCache(url);
}
