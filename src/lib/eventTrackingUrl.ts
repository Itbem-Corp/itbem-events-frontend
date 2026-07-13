import { buildTrackViewUrl } from "./apiUrls";
import { normalizeEventsUrl } from "./eventsUrl";
import { cacheTokenHash } from "./tokenHash";

export { buildTrackViewUrl };

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function optionalBoolean(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") return true;
    if (normalized === "false") return false;
  }
  return undefined;
}

export function viewTrackingSessionKey(
  eventsUrl: string,
  identifier: string,
  invitationToken?: string | null,
): string {
  const normalizedEventsUrl = normalizeEventsUrl(eventsUrl).replace(/\/+$/, "");
  return `view-tracked-${cacheTokenHash(
    [
      normalizedEventsUrl,
      identifier.trim(),
      invitationToken?.trim() || "public",
    ].join("|"),
  )}`;
}

export function viewTrackingWasAccepted(payload: unknown): boolean {
  const candidates = [payload];
  if (isRecord(payload)) {
    candidates.push(payload.data, payload.Data);
  }

  for (const candidate of candidates) {
    if (!isRecord(candidate)) continue;
    const tracked = optionalBoolean(candidate.tracked ?? candidate.Tracked);
    if (tracked !== undefined) return tracked;
  }

  return true;
}
