import { normalizeEventsUrl } from "./eventsUrl";

export function buildInvitationLoadKey(
  eventsUrl: string | null | undefined,
  token: string | null | undefined,
): string {
  const cleanToken = token?.trim() ?? "";
  if (!cleanToken) return "";

  return `${normalizeEventsUrl(eventsUrl)}|${cleanToken}`;
}
