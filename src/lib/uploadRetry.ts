import { isApiFetchError } from "./apiFetch";

export function isRetryableUploadApiError(error: unknown): boolean {
  if (error instanceof Error && error.name === "AbortError") return false;
  return !isApiFetchError(error) || error.status < 400 || error.status >= 500;
}

function waitForRetry(delayMs: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) {
    return Promise.reject(new DOMException("Upload aborted", "AbortError"));
  }
  return new Promise((resolve, reject) => {
    const handleAbort = () => {
      clearTimeout(timeoutId);
      reject(new DOMException("Upload aborted", "AbortError"));
    };
    const timeoutId = setTimeout(() => {
      signal?.removeEventListener("abort", handleAbort);
      resolve();
    }, delayMs);
    signal?.addEventListener("abort", handleAbort, { once: true });
  });
}

/**
 * The backend allows 30 upload requests per IP every 6 s (fixed window,
 * routes.go uploadRateLimiter). Per-file presign (EV-48) roughly doubles the
 * requests of a batch, so a rate-limited request waits out the window instead
 * of failing the file.
 */
export const RATE_LIMIT_RETRY_DELAY_MS = 6000;
export const RATE_LIMIT_MAX_RETRIES = 2;

/**
 * A 429 from the per-IP rate limiter carries no data; the quota 429
 * (limit reached) carries uploads_limit/uploads_remaining and is final.
 */
export function isUploadRateLimitError(error: unknown): boolean {
  if (!isApiFetchError(error) || error.status !== 429) return false;
  const data = (error.payload as { data?: unknown } | null)?.data;
  return data === undefined || data === null;
}

/** The guest reached the upload limit: only the quota 429, never the rate limit. */
export function isUploadQuotaExhaustedError(error: unknown): boolean {
  return (
    isApiFetchError(error) &&
    error.status === 429 &&
    !isUploadRateLimitError(error)
  );
}

export async function retryWhenRateLimited<T>(
  operation: () => Promise<T>,
  signal?: AbortSignal,
  delayMs = RATE_LIMIT_RETRY_DELAY_MS,
  maxRetries = RATE_LIMIT_MAX_RETRIES,
): Promise<T> {
  for (let retry = 0; ; retry += 1) {
    try {
      return await operation();
    } catch (error) {
      if (retry >= maxRetries || !isUploadRateLimitError(error)) throw error;
      await waitForRetry(delayMs, signal);
    }
  }
}

export async function retryUploadApiOnce<T>(
  operation: () => Promise<T>,
  delayMs = 2000,
  signal?: AbortSignal,
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (!isRetryableUploadApiError(error)) {
      throw error;
    }
    if (delayMs > 0) {
      await waitForRetry(delayMs, signal);
    }
    return operation();
  }
}
