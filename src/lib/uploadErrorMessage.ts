import { isApiFetchError } from "./apiFetch";
import { readApiErrorCode } from "./apiError";

/**
 * Guest-facing copy for a failed moment upload (shared QR page and the
 * personal upload dialog). The backend answers confirm/prepare failures with
 * English text such as "Upload verification failed" or "uploaded file is
 * empty"; guests must only see Spanish. Messages the site itself writes in
 * Spanish (and Spanish backend messages such as the quota ones) are kept.
 */

export const UPLOAD_CONNECTION_MESSAGE =
  "No se pudo conectar al servidor. Verifica tu conexión a internet.";
export const UPLOAD_TIMEOUT_MESSAGE =
  "La subida tardó demasiado. Revisa tu conexión.";
export const UPLOAD_SERVER_ERROR_MESSAGE =
  "No pudimos confirmar tu archivo por un problema de nuestro lado. Inténtalo de nuevo en unos minutos.";
export const UPLOAD_INVALID_FILE_MESSAGE =
  "No pudimos verificar tu archivo. Revisa que no esté vacío o dañado e inténtalo de nuevo.";
export const UPLOAD_GENERIC_MESSAGE =
  "No pudimos subir tu archivo. Inténtalo de nuevo.";

const SPANISH_HINT =
  /[áéíóúñ¿¡]|\b(tu|tus|el|la|los|las|de|del|para|pudimos|puedes|intenta|archivo|archivos|subida|subidas|evento)\b/i;

/** True for text that reads as Spanish (keeps the site's own messages). */
export function looksSpanish(message: string): boolean {
  return SPANISH_HINT.test(message);
}

function isNetworkFailure(error: unknown): boolean {
  if (error instanceof TypeError) return true;
  return (
    error instanceof Error &&
    /^(failed to fetch|fetch failed|load failed|network ?error)/i.test(
      error.message.trim(),
    )
  );
}

export function uploadFailureMessage(
  error: unknown,
  fallback: string = UPLOAD_GENERIC_MESSAGE,
): string {
  if (error instanceof Error && error.name === "AbortError") {
    return UPLOAD_TIMEOUT_MESSAGE;
  }

  if (isApiFetchError(error)) {
    const message = error.message?.trim() ?? "";
    const code = readApiErrorCode(error.payload);
    if (error.status >= 500) return UPLOAD_SERVER_ERROR_MESSAGE;
    if (error.status === 413 || code === "file_too_large") {
      return "El archivo es demasiado grande para subirlo.";
    }
    if (error.status === 415) {
      return "Este tipo de archivo no se puede subir. Elige una foto o un video.";
    }
    if (error.status === 401) {
      return "Tu enlace para subir fotos ya no es válido. Pide uno nuevo al organizador.";
    }
    // 403 and 429 carry Spanish backend copy (uploads closed, quota reached).
    if (message && looksSpanish(message)) return message;
    if (error.status === 429) {
      return "Alcanzaste el límite de subidas por ahora. Inténtalo más tarde.";
    }
    if (error.status === 403) {
      return "Las subidas para este evento no están disponibles en este momento.";
    }
    if (error.status === 400 || error.status === 409 || error.status === 422) {
      return UPLOAD_INVALID_FILE_MESSAGE;
    }
    return fallback;
  }

  if (isNetworkFailure(error)) return UPLOAD_CONNECTION_MESSAGE;

  if (error instanceof Error) {
    const message = error.message.trim();
    if (message && looksSpanish(message)) return message;
    if (/\(5\d\d\)|server error|unavailable/i.test(message)) {
      return UPLOAD_SERVER_ERROR_MESSAGE;
    }
  }
  return fallback;
}
