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
