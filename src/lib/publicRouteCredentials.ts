import { PUBLIC_ACCESS_DISPLAY_QUERY_KEYS } from "./publicAccessParams";

/**
 * Query keys that mark a request as carrying (or revealing) an access proof.
 * Built from the shared access-param list so every alias the site accepts or
 * emits (event_access_token, pretty_token, camelCase forms, preview cache key)
 * makes the response private. `access` is a legacy alias kept for old links.
 */
export const CREDENTIAL_QUERY_KEYS: readonly string[] = Array.from(
  new Set<string>([...PUBLIC_ACCESS_DISPLAY_QUERY_KEYS, "access"]),
);

const PUBLIC_EVENT_ROUTE_PREFIXES = ["/e/", "/rsvp/", "/events/"] as const;

export function isPublicEventRoute(pathname: string): boolean {
  return PUBLIC_EVENT_ROUTE_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

export function hasCredentialQuery(searchParams: URLSearchParams): boolean {
  return CREDENTIAL_QUERY_KEYS.some((key) => searchParams.has(key));
}
