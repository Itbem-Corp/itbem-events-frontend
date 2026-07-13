export interface PublicViewAccess {
  activeFrom?: string | null;
  activeUntil?: string | null;
  passwordProtected?: boolean | null;
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

  const currentTime = nowMillis(now);
  const activeFrom = dateMillis(access?.activeFrom);
  if (activeFrom !== null && currentTime < activeFrom) return false;

  const activeUntil = dateMillis(access?.activeUntil);
  if (activeUntil !== null && currentTime > activeUntil) return false;

  if (access?.passwordProtected && !passwordVerified) return false;

  return true;
}
