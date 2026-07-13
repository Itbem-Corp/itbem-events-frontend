import { isApiFetchError } from "./apiFetch";

export type UploadStatusErrorKind =
  "transient" | "unauthorized" | "forbidden" | "invalid" | "not-found";

export interface UploadStatusError {
  kind: UploadStatusErrorKind;
  message: string;
}

export function classifyUploadStatusError(error: unknown): UploadStatusError {
  const message =
    error instanceof Error
      ? error.message
      : "No pudimos cargar el estado de este enlace.";

  if (!isApiFetchError(error)) return { kind: "transient", message };
  if (error.status === 401) return { kind: "unauthorized", message };
  if (error.status === 403) return { kind: "forbidden", message };
  if (error.status === 404) return { kind: "not-found", message };
  if (
    error.status === 408 ||
    error.status === 425 ||
    error.status === 429 ||
    error.status >= 500
  ) {
    return { kind: "transient", message };
  }

  return { kind: "invalid", message };
}
