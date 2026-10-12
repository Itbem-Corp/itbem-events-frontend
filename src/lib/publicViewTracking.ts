export interface PublicViewAccess {
  activeFrom?: string | null;
  activeUntil?: string | null;
  passwordProtected?: boolean | null;
  windowStatus?: "open" | "not_started" | "ended" | null;
}

export interface PublicViewTrackingState {
  access?: PublicViewAccess | null;
  passwordVerified?: boolean;
  previewAuthorized?: boolean;
  now?: Date | number | string;
}

function dateMillis(value: string | null | undefined): number | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  const millis = new Date(trimmed).getTime();
  return Number.isFinite(millis) ? millis : null;
}

function nowMillis(value: PublicViewTrackingState["now"]): number {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const millis = new Date(value).getTime();
    if (Number.isFinite(millis)) return millis;
  }
  return Date.now();
}

export function shouldTrackPublicView({
  access,
  passwordVerified = false,
  previewAuthorized = false,
  now,
}: PublicViewTrackingState): boolean {
  if (previewAuthorized) return false;

  if (access?.windowStatus === "not_started" || access?.windowStatus === "ended") {
    return false;
  }
  const windowOpenByServer = access?.windowStatus === "open";

  const currentTime = nowMillis(now);
  const activeFrom = dateMillis(access?.activeFrom);
  if (!windowOpenByServer && activeFrom !== null && currentTime < activeFrom)
    return false;

  const activeUntil = dateMillis(access?.activeUntil);
  if (!windowOpenByServer && activeUntil !== null && currentTime > activeUntil)
    return false;

  if (access?.passwordProtected && !passwordVerified) return false;

  return true;
}
