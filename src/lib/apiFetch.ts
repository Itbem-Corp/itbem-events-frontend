import { readApiData } from "./apiEnvelope";
import { getApiErrorMessage } from "./apiError";

export class ApiFetchError extends Error {
  readonly status: number;
  readonly payload: unknown;

  constructor(message: string, status: number, payload: unknown) {
    super(message);
    this.name = "ApiFetchError";
    this.status = status;
    this.payload = payload;
  }
}

export function isApiFetchError(error: unknown): error is ApiFetchError {
  return error instanceof ApiFetchError;
}

export interface ApiFetchResult<T> {
  ok: boolean;
  status: number;
  payload: unknown;
  data: T | null;
  message: string;
  /** Seconds from a `Retry-After` header on a failed response, when present. */
  retryAfterSeconds?: number;
}

/**
 * Parses `Retry-After` (delta-seconds or an HTTP date) into whole seconds,
 * at least 1. Returns undefined when the header is absent or unusable.
 */
export function parseRetryAfterSeconds(
  value: string | null | undefined,
  now = Date.now(),
): number | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  if (/^\d+$/.test(trimmed)) {
    return Math.max(1, Number.parseInt(trimmed, 10));
  }
  const date = Date.parse(trimmed);
  if (Number.isNaN(date)) return undefined;
  return Math.max(1, Math.ceil((date - now) / 1000));
}

export async function fetchApiResult<T>(
  input: RequestInfo | URL,
  init?: RequestInit,
  fallbackMessage?: string,
): Promise<ApiFetchResult<T>> {
  const response = await fetch(input, init);
  const payload = await response.json().catch(() => null);
  const message = response.ok
    ? ""
    : getApiErrorMessage(
        payload,
        fallbackMessage ?? `API error: ${response.status}`,
      );

  const result: ApiFetchResult<T> = {
    ok: response.ok,
    status: response.status,
    payload,
    data: response.ok ? readApiData<T>(payload) : null,
    message,
  };
  if (!response.ok) {
    const retryAfterSeconds = parseRetryAfterSeconds(
      response.headers?.get?.("Retry-After"),
    );
    if (retryAfterSeconds !== undefined) {
      result.retryAfterSeconds = retryAfterSeconds;
    }
  }
  return result;
}

export async function fetchApiData<T>(
  input: RequestInfo | URL,
  init?: RequestInit,
  fallbackMessage?: string,
): Promise<T> {
  const result = await fetchApiResult<T>(input, init, fallbackMessage);

  if (!result.ok) {
    throw new ApiFetchError(
      result.message,
      result.status,
      result.payload,
    );
  }

  return result.data as T;
}
