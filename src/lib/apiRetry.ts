import {
  fetchApiResult,
  type ApiFetchResult,
} from "./apiFetch";

interface FetchApiRetryOptions {
  retries?: number;
  init?: RequestInit;
  fallbackMessage?: string;
  retryDelayMs?: (attemptIndex: number) => number;
}

const DEFAULT_RETRIES = 3;

function defaultRetryDelayMs(attemptIndex: number): number {
  return 500 * (attemptIndex + 1);
}

function wait(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchApiResultWithRetry<T>(
  url: string,
  optionsOrRetries: FetchApiRetryOptions | number = {},
  legacyInit?: RequestInit,
  legacyFallbackMessage?: string,
): Promise<ApiFetchResult<T>> {
  const options =
    typeof optionsOrRetries === "number"
      ? {
          retries: optionsOrRetries,
          init: legacyInit,
          fallbackMessage: legacyFallbackMessage,
        }
      : optionsOrRetries;
  const {
    retries = DEFAULT_RETRIES,
    init,
    fallbackMessage,
    retryDelayMs = defaultRetryDelayMs,
  } = options;
  const attempts = Math.max(1, retries);
  let lastResult: ApiFetchResult<T> | null = null;
  let lastError: unknown = null;

  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const result = await fetchApiResult<T>(url, init, fallbackMessage);
      lastResult = result;

      // 401/403/404 are access/token decisions; do not retry them.
      if (
        result.ok ||
        result.status === 401 ||
        result.status === 403 ||
        result.status === 404
      ) {
        return result;
      }
    } catch (error) {
      lastError = error;
    }

    if (attempt < attempts - 1) {
      await wait(retryDelayMs(attempt));
    }
  }

  if (lastResult) {
    throw new Error(
      lastResult.message || `Error del servidor (${lastResult.status})`,
    );
  }

  throw new Error(
    fallbackMessage ??
      (lastError instanceof Error && lastError.message.trim()
        ? lastError.message
        : "No se pudo conectar. Verifica tu conexion e intenta de nuevo."),
  );
}
