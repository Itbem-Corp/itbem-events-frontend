import { readPublicInvitationToken } from "./publicInvitationToken";
import {
  PUBLIC_EVENT_ACCESS_HEADER_NAME,
  PUBLIC_EVENT_ACCESS_TOKEN_QUERY_KEYS,
  PUBLIC_INVITATION_TOKEN_QUERY_KEYS,
  PUBLIC_PREVIEW_CACHE_KEY_QUERY_KEY,
  PUBLIC_PREVIEW_MODE_QUERY_KEY,
  PUBLIC_PREVIEW_TOKEN_QUERY_KEYS,
} from "./publicAccessParams";
import { publicQueryParams } from "./publicQueryParams";

type QueryValue = string | undefined;

const PUBLIC_PREVIEW_TOKEN_QUERY_KEY = PUBLIC_PREVIEW_TOKEN_QUERY_KEYS[0];
const PUBLIC_INVITATION_TOKEN_QUERY_KEY =
  PUBLIC_INVITATION_TOKEN_QUERY_KEYS[0];
const PUBLIC_EVENT_ACCESS_TOKEN_QUERY_KEY =
  PUBLIC_EVENT_ACCESS_TOKEN_QUERY_KEYS[0];

export interface PublicPreviewParams {
  isPreview: boolean;
  previewToken: string;
  cacheKey: string;
}

export interface PublicAccessParams extends PublicPreviewParams {
  invitationToken: string;
  accessToken?: string;
}

export interface PublicAccessFetchParams {
  previewToken?: string | null;
  cacheKey?: string | number | null;
  sendCacheKey?: boolean | null;
  invitationToken?: string | null;
  accessToken?: string | null;
}

export interface ResolvedPublicAccessParams extends PublicAccessParams {
  accessToken: string;
  sendCacheKey?: boolean;
}

function hasToken(value: string | null | undefined): boolean {
  return Boolean(value?.trim());
}

function firstQueryToken(
  params: URLSearchParams,
  keys: readonly string[],
): string {
  for (const key of keys) {
    const token = params.get(key)?.trim();
    if (token) return token;
  }
  return "";
}

function cleanParam(value: string | null | undefined): string {
  return value?.trim() ?? "";
}

function resolveStringParam(
  override: string | null | undefined,
  fallback = "",
): string {
  return cleanParam(override) || fallback;
}

function resolveCacheKeyParam(
  override: string | number | null | undefined,
  fallback = "",
): string {
  if (override === undefined || override === null) return fallback;
  return String(override).trim() || fallback;
}

export function shouldBypassPublicAccessHttpCache(
  params: PublicAccessFetchParams,
): boolean {
  return (
    hasToken(params.previewToken) ||
    hasToken(params.invitationToken) ||
    hasToken(params.accessToken) ||
    Boolean(params.sendCacheKey && hasToken(String(params.cacheKey ?? "")))
  );
}

function withEventAccessHeader(
  init: RequestInit | undefined,
  accessToken: string,
): RequestInit {
  const headers = new Headers(init?.headers);
  headers.set(PUBLIC_EVENT_ACCESS_HEADER_NAME, accessToken);
  return {
    ...(init ?? {}),
    headers,
  };
}

export function publicAccessFetchInit(
  params: PublicAccessFetchParams,
  init?: RequestInit,
): RequestInit | undefined {
  const accessToken = params.accessToken?.trim();
  const nextInit = accessToken
    ? withEventAccessHeader(init, accessToken)
    : init;
  if (!shouldBypassPublicAccessHttpCache(params)) return nextInit;
  return {
    ...(nextInit ?? {}),
    cache: "no-store",
  };
}

export function parsePublicPreviewParams(search = ""): PublicPreviewParams {
  const params = publicQueryParams(search);
  const previewToken = firstQueryToken(params, PUBLIC_PREVIEW_TOKEN_QUERY_KEYS);
  const isPreview = previewToken !== "";
  return {
    isPreview,
    previewToken: isPreview ? previewToken : "",
    cacheKey: isPreview
      ? (params.get(PUBLIC_PREVIEW_CACHE_KEY_QUERY_KEY)?.trim() ?? "")
      : "",
  };
}

export function readPublicAccessParams(search?: string): PublicAccessParams {
  const query =
    search ?? (typeof window !== "undefined" ? window.location.search : "");
  const params = publicQueryParams(query);
  const accessToken = firstQueryToken(
    params,
    PUBLIC_EVENT_ACCESS_TOKEN_QUERY_KEYS,
  );
  const accessParams = {
    ...parsePublicPreviewParams(query),
    invitationToken: readPublicInvitationToken(query),
  };
  if (!accessToken) return accessParams;
  return {
    ...accessParams,
    accessToken,
  };
}

export function resolvePublicAccessParams(
  publicAccess?: PublicAccessFetchParams,
  search?: string,
): ResolvedPublicAccessParams {
  const queryAccessParams = readPublicAccessParams(search);
  const previewToken = resolveStringParam(
    publicAccess?.previewToken,
    queryAccessParams.previewToken,
  );
  const cacheKey = resolveCacheKeyParam(
    publicAccess?.cacheKey,
    queryAccessParams.cacheKey,
  );
  const invitationToken = resolveStringParam(
    publicAccess?.invitationToken,
    queryAccessParams.invitationToken,
  );
  const accessToken = resolveStringParam(
    publicAccess?.accessToken,
    queryAccessParams.accessToken ?? "",
  );
  return {
    ...queryAccessParams,
    isPreview: previewToken !== "",
    previewToken,
    cacheKey,
    ...(publicAccess?.sendCacheKey ? { sendCacheKey: true } : {}),
    invitationToken,
    accessToken,
  };
}

export function publicAccessQueryParams({
  cacheKey,
  sendCacheKey,
  previewToken,
  invitationToken,
}: Pick<
  PublicAccessFetchParams,
  "cacheKey" | "sendCacheKey" | "previewToken" | "invitationToken"
>): {
  t?: QueryValue;
  preview_token?: QueryValue;
  token?: QueryValue;
} {
  const cleanPreviewToken = String(previewToken ?? "").trim();
  const cleanCacheKey = String(cacheKey ?? "").trim();
  const cleanInvitationToken = String(invitationToken ?? "").trim();
  return {
    [PUBLIC_PREVIEW_TOKEN_QUERY_KEY]: cleanPreviewToken || undefined,
    [PUBLIC_PREVIEW_CACHE_KEY_QUERY_KEY]:
      cleanCacheKey && (cleanPreviewToken || sendCacheKey)
        ? cleanCacheKey
        : undefined,
    [PUBLIC_INVITATION_TOKEN_QUERY_KEY]: cleanInvitationToken || undefined,
  };
}

export function publicAccessLinkQueryParams({
  cacheKey,
  previewToken,
  invitationToken,
  accessToken,
}: Pick<
  PublicAccessFetchParams,
  "cacheKey" | "previewToken" | "invitationToken" | "accessToken"
>): Record<string, QueryValue> {
  const cleanPreviewToken = String(previewToken ?? "").trim();
  const cleanCacheKey = String(cacheKey ?? "").trim();
  const cleanInvitationToken = String(invitationToken ?? "").trim();
  const cleanAccessToken = String(accessToken ?? "").trim();
  return {
    [PUBLIC_PREVIEW_MODE_QUERY_KEY]: cleanPreviewToken ? "1" : undefined,
    [PUBLIC_PREVIEW_CACHE_KEY_QUERY_KEY]:
      cleanPreviewToken && cleanCacheKey ? cleanCacheKey : undefined,
    [PUBLIC_PREVIEW_TOKEN_QUERY_KEY]: cleanPreviewToken || undefined,
    [PUBLIC_INVITATION_TOKEN_QUERY_KEY]: cleanInvitationToken || undefined,
    [PUBLIC_EVENT_ACCESS_TOKEN_QUERY_KEY]: cleanAccessToken || undefined,
  };
}
