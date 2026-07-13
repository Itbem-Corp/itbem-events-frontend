import { normalizeEventsUrl } from "./eventsUrl";
import { cacheTokenHash } from "./tokenHash";

function normalizedScopePart(value: string | null | undefined, fallback: string) {
  return value?.trim() || fallback;
}

function normalizedEventsScope(eventsUrl: string) {
  return normalizeEventsUrl(eventsUrl).replace(/\/+$/, "");
}

export function passwordVerificationSessionKey(
  eventsUrl: string,
  identifier: string,
  accessVersion?: string | null,
  invitationToken?: string | null,
): string {
  return `event-verified-${cacheTokenHash(
    [
      normalizedEventsScope(eventsUrl),
      identifier.trim(),
      normalizedScopePart(accessVersion, "unversioned"),
      normalizedScopePart(invitationToken, "public"),
    ].join("|"),
  )}`;
}
