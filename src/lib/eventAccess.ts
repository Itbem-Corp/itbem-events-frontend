import { readApiData } from "./apiEnvelope";

type AnyRecord = Record<string, unknown>;

export interface EventAccessVerification {
  passwordProtected: boolean;
  accessToken: string;
  accessTokenType: string;
  accessVersion: string;
  expiresAt: string;
}

function isRecord(value: unknown): value is AnyRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function firstValue(source: AnyRecord, keys: string[]): unknown {
  let blankString: string | undefined;

  for (const key of keys) {
    if (!(key in source)) continue;
    const value = source[key];
    if (value === undefined || value === null) continue;
    if (typeof value === "string" && !value.trim()) {
      blankString ??= value;
      continue;
    }
    return value;
  }

  return blankString;
}

function optionalString(value: unknown): string {
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return value.toISOString();
  }
  if (typeof value !== "string") return "";
  return value.trim();
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

export function normalizeEventAccessVerification(
  payload: unknown,
): EventAccessVerification {
  const candidates = [readApiData<unknown>(payload)];
  if (isRecord(payload)) {
    const rawData = firstValue(payload, ["data", "Data"]);
    if (rawData !== undefined && !candidates.includes(rawData)) {
      candidates.push(rawData);
    }
  }

  const root = candidates.find(isRecord) ?? {};
  const nested = firstValue(root, ["data", "Data"]);
  const source = isRecord(nested) ? nested : root;

  return {
    passwordProtected:
      optionalBoolean(
        firstValue(source, [
          "passwordProtected",
          "password_protected",
          "PasswordProtected",
        ]),
      ) ?? false,
    accessToken: optionalString(
      firstValue(source, ["accessToken", "access_token", "AccessToken"]),
    ),
    accessTokenType: optionalString(
      firstValue(source, [
        "accessTokenType",
        "access_token_type",
        "AccessTokenType",
      ]),
    ),
    accessVersion: optionalString(
      firstValue(source, ["accessVersion", "access_version", "AccessVersion"]),
    ),
    expiresAt: optionalString(
      firstValue(source, ["expiresAt", "expires_at", "ExpiresAt"]),
    ),
  };
}
