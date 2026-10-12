function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function isHttpStatus(value: unknown): value is number {
  return (
    Number.isInteger(value) && Number(value) >= 100 && Number(value) <= 599
  );
}

const GENERIC_API_MESSAGES = new Set([
  "error",
  "error preparing multipart upload",
  "error uploading file",
  "error processing image",
  "failed to upload cover",
  "failed to upload resources",
  "invalid data",
  "invalid event config field",
  "invalid event id",
  "invalid event uuid",
  "invalid file",
  "invalid cursor",
  "invalid id",
  "invalid invitation token",
  "invalid logo",
  "invalid preview token",
  "invalid request body",
  "invalid rsvp request",
  "invalid section config",
  "invalid section uuid",
  "invalid upload key",
  "invalid uuid",
  "operation failed",
  "registration failed",
  "rsvp confirmation failed",
  "update error",
  "validation error",
]);

function isGenericApiMessage(message: string): boolean {
  return GENERIC_API_MESSAGES.has(message.trim().toLowerCase());
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}

function firstValue(source: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    if (!(key in source)) continue;

    const candidate = source[key];
    if (candidate === undefined || candidate === null) continue;
    if (typeof candidate === "string" && !candidate.trim()) continue;

    return candidate;
  }
  return undefined;
}

function messageFromPayload(payload: unknown): string | null {
  if (!isRecord(payload)) return null;

  const data = payload;
  const detail = stringOrNull(firstValue(data, ["detail", "Detail"]));
  if (detail) return detail;

  const message = stringOrNull(firstValue(data, ["message", "Message"]));
  const error = stringOrNull(firstValue(data, ["error", "Error"]));

  if (isHttpStatus(firstValue(data, ["status", "Status"]))) {
    const normalizedMessage = message?.trim().toLowerCase();
    const normalizedError = error?.trim().toLowerCase();
    if (
      message &&
      normalizedError === "unauthorized" &&
      normalizedMessage !== normalizedError &&
      normalizedMessage !== "error"
    ) {
      return message;
    }
    return (
      (message && (!error || !isGenericApiMessage(message)) ? message : null) ??
      error ??
      message
    );
  }

  return error ?? message;
}

function isApiFetchErrorLike(error: unknown): error is {
  payload: unknown;
  status: number;
} {
  return isRecord(error) && "payload" in error && isHttpStatus(error.status);
}

function responsePayload(error: unknown): unknown {
  if (!isRecord(error)) return null;
  const response = error.response;
  if (!isRecord(response)) return null;
  return response.data;
}

export function getApiErrorMessage(error: unknown, fallback: string): string {
  if (isApiFetchErrorLike(error)) {
    const payloadMessage = messageFromPayload(error.payload);
    if (payloadMessage) return payloadMessage;
  }

  const responseMessage = messageFromPayload(responsePayload(error));
  if (responseMessage) return responseMessage;

  const directMessage = messageFromPayload(error);
  if (directMessage) return directMessage;

  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return fallback;
}

export async function readApiErrorMessage(
  response: Response,
  fallback: string,
): Promise<string> {
  const payload = await response.json().catch(() => null);
  return getApiErrorMessage(payload, fallback);
}

// ---------------------------------------------------------------------------
// Guest-facing (public site) error copy.
//
// The backend answers with English `message`/`error` text and, sometimes, raw
// internal details (SQL errors, "record not found"). Guests must never see
// that: map known codes and statuses to Spanish and fall back to a fixed
// Spanish message otherwise. The `error` field is never shown.
// ---------------------------------------------------------------------------

export type PublicApiErrorContext =
  | "rsvp"
  | "invitation"
  | "password"
  | "event"
  | "upload";

export const RSVP_CLOSED_MESSAGE =
  "Las confirmaciones para este evento ya están cerradas.";

const PUBLIC_FALLBACKS: Record<PublicApiErrorContext, string> = {
  rsvp: "No pudimos guardar tu respuesta. Inténtalo de nuevo.",
  invitation: "No pudimos cargar tu invitación. Inténtalo de nuevo.",
  password: "No pudimos validar la contraseña. Inténtalo de nuevo.",
  event: "No pudimos cargar el evento. Inténtalo de nuevo.",
  upload: "No pudimos subir tu archivo. Inténtalo de nuevo.",
};

function extractStatusAndPayload(error: unknown): {
  status: number | null;
  payload: unknown;
} {
  if (isApiFetchErrorLike(error)) {
    return { status: error.status, payload: error.payload };
  }
  if (isRecord(error)) {
    const response = error.response;
    if (isRecord(response)) {
      const status = isHttpStatus(response.status) ? response.status : null;
      return { status, payload: response.data };
    }
    const status = firstValue(error, ["status", "Status"]);
    return { status: isHttpStatus(status) ? status : null, payload: error };
  }
  return { status: null, payload: null };
}

const CODE_LIKE = /^[a-z][a-z0-9_]*_[a-z0-9_]+$/;

/**
 * Reads a machine-readable error code (e.g. `rsvp_closed`) from a payload.
 * The backend puts it in `code`, or (older handlers) in `error` as a
 * snake_case token such as `event_gone` or `rsvp_text_too_long`.
 */
export function readApiErrorCode(payload: unknown): string | null {
  if (!isRecord(payload)) return null;
  const direct = stringOrNull(
    firstValue(payload, ["code", "Code", "error_code", "errorCode", "ErrorCode"]),
  );
  if (direct) return direct.trim().toLowerCase();
  const errorToken = stringOrNull(firstValue(payload, ["error", "Error"]))
    ?.trim()
    .toLowerCase();
  if (errorToken && CODE_LIKE.test(errorToken)) return errorToken;
  const data = payload.data ?? payload.Data;
  if (isRecord(data)) {
    const nested = stringOrNull(
      firstValue(data, ["code", "Code", "error_code", "errorCode", "ErrorCode"]),
    );
    if (nested) return nested.trim().toLowerCase();
  }
  return null;
}

function payloadText(payload: unknown): string {
  if (!isRecord(payload)) return typeof payload === "string" ? payload : "";
  const parts = [
    firstValue(payload, ["message", "Message"]),
    firstValue(payload, ["error", "Error"]),
    firstValue(payload, ["detail", "Detail"]),
  ];
  return parts
    .filter((part): part is string => typeof part === "string")
    .join(" ")
    .toLowerCase();
}

/** True when the error is the backend's `rsvp_closed` refusal. */
export function isRsvpClosedError(error: unknown): boolean {
  const { payload } = extractStatusAndPayload(error);
  if (readApiErrorCode(payload) === "rsvp_closed") return true;
  const text = payloadText(payload);
  return /rsvp[_ ](is )?closed/.test(text);
}

export const EVENT_GONE_MESSAGE = "Este evento ya no está disponible";
export const EVENT_PASSWORD_REQUIRED_MESSAGE =
  "Esta invitación está protegida con contraseña. Ingrésala para continuar.";

/** True for 401 `event_password_required` (ByToken and RSVP). */
export function isEventPasswordRequiredError(error: unknown): boolean {
  const { payload } = extractStatusAndPayload(error);
  return readApiErrorCode(payload) === "event_password_required";
}

/** True for 410 `event_gone` (the event was deleted). */
export function isEventGoneError(error: unknown): boolean {
  const { status, payload } = extractStatusAndPayload(error);
  return status === 410 || readApiErrorCode(payload) === "event_gone";
}

/** "45 segundos", "1 minuto", "15 minutos". */
export function formatRetryWait(seconds: number): string {
  const safe = Math.max(1, Math.ceil(seconds));
  if (safe < 60) return safe === 1 ? "1 segundo" : `${safe} segundos`;
  const minutes = Math.ceil(safe / 60);
  return minutes === 1 ? "1 minuto" : `${minutes} minutos`;
}

export function tooManyPasswordAttemptsMessage(retryAfterSeconds?: number): string {
  return retryAfterSeconds && retryAfterSeconds > 0
    ? `Hiciste demasiados intentos con la contraseña. Espera ${formatRetryWait(retryAfterSeconds)} e inténtalo de nuevo.`
    : "Hiciste demasiados intentos con la contraseña. Espera unos minutos e inténtalo de nuevo.";
}

function isNetworkFailure(error: unknown): boolean {
  if (error instanceof TypeError) return true;
  if (!(error instanceof Error)) return false;
  return /^(failed to fetch|fetch failed|load failed|network ?error)/i.test(
    error.message.trim(),
  );
}

export function getPublicApiErrorMessage(
  error: unknown,
  context: PublicApiErrorContext,
  fallback: string = PUBLIC_FALLBACKS[context],
): string {
  const { status, payload } = extractStatusAndPayload(error);
  const code = readApiErrorCode(payload);
  const text = `${code ?? ""} ${payloadText(payload)}`;

  if (isRsvpClosedError(error)) return RSVP_CLOSED_MESSAGE;
  if (isEventGoneError(error)) return EVENT_GONE_MESSAGE;
  if (code === "event_password_required") return EVENT_PASSWORD_REQUIRED_MESSAGE;

  if (status === 429 || code === "too_many_attempts") {
    const retryAfter =
      isRecord(error) && typeof error.retryAfterSeconds === "number"
        ? error.retryAfterSeconds
        : undefined;
    return context === "password"
      ? tooManyPasswordAttemptsMessage(retryAfter)
      : "Hiciste demasiados intentos. Espera un momento e inténtalo de nuevo.";
  }

  if (code === "rsvp_text_too_long") {
    // The backend message is already Spanish: "El campo «…» admite máximo N caracteres."
    const message = stringOrNull(
      isRecord(payload) ? firstValue(payload, ["message", "Message"]) : null,
    );
    return message && /admite|caracteres/i.test(message)
      ? message
      : "Uno de los textos es demasiado largo. Acórtalo e inténtalo de nuevo.";
  }

  if (code === "rsvp_save_failed") {
    return "No pudimos guardar tu respuesta. Inténtalo de nuevo en unos minutos.";
  }

  if (/exceeds allowed max|guest count/.test(text)) {
    return "Elegiste más personas de las permitidas en tu invitación.";
  }

  if (/value too long|sqlstate 22001|too long/.test(text)) {
    return "Uno de los textos es demasiado largo. Acórtalo e inténtalo de nuevo.";
  }

  if (context === "password" && (status === 401 || status === 400)) {
    return "Contraseña incorrecta. Intenta de nuevo.";
  }

  if (
    /expired|invalid or expired token|invalid invitation token|record not found|invalid_token|token_expired/.test(
      text,
    ) ||
    status === 401
  ) {
    return "Este enlace ya no es válido o expiró. Pide al organizador que te comparta uno nuevo.";
  }

  if (/not public|not_public/.test(text) || status === 403) {
    return "Esta invitación aún no está disponible o ya cerró.";
  }

  if (status === 404) {
    return context === "upload"
      ? "No encontramos este evento."
      : "No encontramos esta invitación. Revisa que el enlace esté completo.";
  }

  if (status === 400 || status === 422) {
    return context === "rsvp"
      ? "Revisa los datos de tu respuesta e inténtalo de nuevo."
      : fallback;
  }

  if (status !== null && status >= 500) {
    return "Tuvimos un problema de nuestro lado. Inténtalo de nuevo en unos minutos.";
  }

  if (status === null && isNetworkFailure(error)) {
    return "No pudimos conectar. Revisa tu conexión e inténtalo de nuevo.";
  }

  return fallback;
}
