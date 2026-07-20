export type PresignedUploadFailureKind =
  | "redirect"
  | "expired"
  | "too-large"
  | "server"
  | "timeout"
  | "network"
  | "unknown";

export interface PresignedUploadFailure {
  kind: PresignedUploadFailureKind;
  message: string;
  retryable: boolean;
}

export class PresignedUploadError extends Error {
  readonly name = "PresignedUploadError";

  constructor(
    message: string,
    readonly kind: PresignedUploadFailureKind,
    readonly retryable: boolean,
    readonly status?: number,
  ) {
    super(message);
  }
}

export function classifyPresignedUploadStatus(
  status: number,
): PresignedUploadFailure {
  if (status === 301 || status === 307 || status === 308) {
    return {
      kind: "redirect",
      message:
        "El almacenamiento no está disponible en este momento. Intenta de nuevo más tarde.",
      retryable: false,
    };
  }
  if (status === 401 || status === 403) {
    return {
      kind: "expired",
      message:
        "El enlace seguro de subida expiró. Intenta nuevamente para generar uno nuevo.",
      retryable: false,
    };
  }
  if (status === 413) {
    return {
      kind: "too-large",
      message: "El archivo es demasiado grande para subirlo.",
      retryable: false,
    };
  }
  if (status === 408 || status === 425 || status === 429 || status >= 500) {
    return {
      kind: "server",
      message:
        "El almacenamiento respondió con un error temporal. Estamos reintentando la subida.",
      retryable: true,
    };
  }
  return {
    kind: "unknown",
    message: `No se pudo subir el archivo (código ${status || "desconocido"}).`,
    retryable: false,
  };
}

interface PresignedUploadOptions {
  url: string;
  body: Blob;
  contentType: string;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  timeoutMs?: number;
  maxAttempts?: number;
  onProgress?: (progress: number) => void;
}

function abortError(): DOMException {
  return new DOMException("Upload aborted", "AbortError");
}

function waitForRetry(delayMs: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(abortError());
  return new Promise((resolve, reject) => {
    const handleAbort = () => {
      window.clearTimeout(timer);
      reject(abortError());
    };
    const timer = window.setTimeout(() => {
      signal?.removeEventListener("abort", handleAbort);
      resolve();
    }, delayMs);
    signal?.addEventListener("abort", handleAbort, { once: true });
  });
}

function uploadAttempt({
  url,
  body,
  contentType,
  headers,
  signal,
  timeoutMs,
  onProgress,
}: Required<Pick<PresignedUploadOptions, "url" | "body" | "contentType">> &
  Pick<
    PresignedUploadOptions,
    "headers" | "signal" | "timeoutMs" | "onProgress"
  >): Promise<void> {
  if (signal?.aborted) return Promise.reject(abortError());

  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    let settled = false;

    const settle = (callback: () => void) => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener("abort", handleAbort);
      callback();
    };
    const handleAbort = () => request.abort();

    request.open("PUT", url);
    request.timeout = timeoutMs ?? 120_000;
    request.setRequestHeader("Content-Type", contentType);
    for (const [name, value] of Object.entries(headers ?? {})) {
      request.setRequestHeader(name, value);
    }
    request.upload.onprogress = (event) => {
      if (!event.lengthComputable || event.total <= 0) return;
      onProgress?.(
        Math.min(100, Math.round((event.loaded / event.total) * 100)),
      );
    };
    request.onload = () => {
      if (request.status >= 200 && request.status < 300) {
        settle(resolve);
        return;
      }
      const failure = classifyPresignedUploadStatus(request.status);
      settle(() =>
        reject(
          new PresignedUploadError(
            failure.message,
            failure.kind,
            failure.retryable,
            request.status,
          ),
        ),
      );
    };
    request.onerror = () =>
      settle(() =>
        reject(
          new PresignedUploadError(
            "La conexión se interrumpió durante la subida.",
            "network",
            true,
          ),
        ),
      );
    request.ontimeout = () =>
      settle(() =>
        reject(
          new PresignedUploadError(
            "La subida tardó demasiado. Revisa tu conexión e intenta de nuevo.",
            "timeout",
            true,
          ),
        ),
      );
    request.onabort = () => settle(() => reject(abortError()));

    signal?.addEventListener("abort", handleAbort, { once: true });
    request.send(body);
  });
}

export async function uploadToPresignedUrl({
  maxAttempts = 3,
  ...options
}: PresignedUploadOptions): Promise<void> {
  let lastError: unknown;
  const attempts = Math.max(1, maxAttempts);

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      if (attempt > 1) options.onProgress?.(0);
      await uploadAttempt(options);
      return;
    } catch (error) {
      lastError = error;
      if (error instanceof Error && error.name === "AbortError") throw error;
      if (
        !(error instanceof PresignedUploadError) ||
        !error.retryable ||
        attempt === attempts
      ) {
        throw error;
      }
      await waitForRetry(600 * 2 ** (attempt - 1), options.signal);
    }
  }

  throw lastError;
}
