import type { PageAccess } from "../components/engine/types";

export type PublicAccessWindowStatus = "open" | "not_started" | "ended";
export type PublicWindowGate = "coming_soon" | "ended" | null;

export function normalizeWindowStatus(
  value: unknown,
): PublicAccessWindowStatus | undefined {
  if (typeof value !== "string") return undefined;
  const status = value.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (status === "open" || status === "not_started" || status === "ended") {
    return status;
  }
  return undefined;
}

/**
 * Which lifecycle screen the public page shows. The backend's
 * `meta.access.windowStatus` is authoritative; the device clock is only a
 * fallback for older payloads that do not send it.
 */
export function resolvePublicWindowGate(
  access: Pick<PageAccess, "activeFrom" | "activeUntil" | "windowStatus"> | undefined,
  now = new Date(),
): PublicWindowGate {
  if (!access) return null;
  if (access.windowStatus === "not_started") return "coming_soon";
  if (access.windowStatus === "ended") return "ended";
  if (access.windowStatus === "open") return null;

  if (access.activeFrom) {
    const from = new Date(access.activeFrom);
    if (!Number.isNaN(from.getTime()) && now < from) return "coming_soon";
  }
  if (access.activeUntil) {
    const until = new Date(access.activeUntil);
    if (!Number.isNaN(until.getTime()) && now > until) return "ended";
  }
  return null;
}
