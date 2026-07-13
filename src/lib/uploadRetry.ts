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
