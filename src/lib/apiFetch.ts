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

  return {
    ok: response.ok,
    status: response.status,
    payload,
    data: response.ok ? readApiData<T>(payload) : null,
    message,
  };
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
