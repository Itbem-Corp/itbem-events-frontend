import { passwordVerificationSessionKey } from "./accessSessionKeys";

interface EventAccessStorageScope {
  eventsUrl: string;
  identifier: string;
  accessVersion?: string | null;
  invitationToken?: string | null;
}

interface VerifiedEventAccessToken extends EventAccessStorageScope {
  accessToken?: string | null;
  passwordProtected?: boolean | null;
  passwordVerified?: boolean | null;
  previewAuthorized?: boolean | null;
}

function clean(value: string | null | undefined): string {
  return value?.trim() ?? "";
}

function defaultStorage(): Storage | null {
  if (typeof sessionStorage === "undefined") return null;
  return sessionStorage;
}

export function eventAccessStorageKey({
  eventsUrl,
  identifier,
  accessVersion,
  invitationToken,
}: EventAccessStorageScope): string {
  return passwordVerificationSessionKey(
    eventsUrl,
    identifier,
    accessVersion,
    invitationToken,
  );
}

export function readStoredEventAccessToken(
  scope: EventAccessStorageScope,
  storage: Storage | null = defaultStorage(),
): string {
  try {
    const token = clean(storage?.getItem(eventAccessStorageKey(scope)));
    return token && token !== "1" ? token : "";
  } catch {
    return "";
  }
}

export function storeEventAccessToken(
  scope: EventAccessStorageScope,
  accessToken: string | null | undefined,
  storage: Storage | null = defaultStorage(),
): boolean {
  const token = clean(accessToken);
  if (!token) return false;
  try {
    storage?.setItem(eventAccessStorageKey(scope), token);
    return true;
  } catch {
    return false;
  }
}

export function storeVerifiedEventAccessToken(
  {
    accessToken,
    passwordProtected,
    passwordVerified,
    previewAuthorized,
    ...scope
  }: VerifiedEventAccessToken,
  storage: Storage | null = defaultStorage(),
): boolean {
  if (!passwordProtected || !passwordVerified || previewAuthorized) {
    return false;
  }
  return storeEventAccessToken(scope, accessToken, storage);
}

export function removeStoredEventAccessToken(
  scope: EventAccessStorageScope,
  storage: Storage | null = defaultStorage(),
): boolean {
  try {
    storage?.removeItem(eventAccessStorageKey(scope));
    return true;
  } catch {
    return false;
  }
}
