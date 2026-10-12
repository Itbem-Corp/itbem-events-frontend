import { describe, expect, it, vi } from "vitest";

import { ApiFetchError } from "../../src/lib/apiFetch";
import {
  UPLOAD_CONNECTION_MESSAGE,
  UPLOAD_INVALID_FILE_MESSAGE,
  UPLOAD_SERVER_ERROR_MESSAGE,
  UPLOAD_TIMEOUT_MESSAGE,
  uploadFailureMessage,
} from "../../src/lib/uploadErrorMessage";
import {
  confirmRetrySubtitle,
  withRetry,
} from "../../src/components/shared-upload/SharedUploadEngine";

const apiError = (status: number, payload: unknown, message = "x") =>
  new ApiFetchError(message, status, payload);

// PUB-93, PUB-94, STU-57: confirm failures showed the backend's English text.
describe("uploadFailureMessage", () => {
  it("never shows the backend's English confirm errors", () => {
    expect(
      uploadFailureMessage(
        apiError(503, { message: "Upload verification failed" }, "Upload verification failed"),
      ),
    ).toBe(UPLOAD_SERVER_ERROR_MESSAGE);
    expect(
      uploadFailureMessage(apiError(400, { message: "uploaded file is empty" }, "uploaded file is empty")),
    ).toBe(UPLOAD_INVALID_FILE_MESSAGE);
    expect(
      uploadFailureMessage(new Error("media processing queue unavailable")),
    ).toBe(UPLOAD_SERVER_ERROR_MESSAGE);
  });

  it("keeps Spanish backend copy for quota and closed uploads", () => {
    const quota = "Alcanzaste el máximo de 3 archivos para este evento.";
    expect(uploadFailureMessage(apiError(429, { message: quota }, quota))).toBe(quota);
    expect(uploadFailureMessage(apiError(429, {}, "Too Many Requests"))).toContain("límite");
    expect(uploadFailureMessage(apiError(403, {}, "Forbidden"))).toContain("no están disponibles");
  });

  it("maps size, type, link and network failures", () => {
    expect(uploadFailureMessage(apiError(413, {}, "too large"))).toContain("demasiado grande");
    expect(uploadFailureMessage(apiError(415, {}, "unsupported"))).toContain("tipo de archivo");
    expect(uploadFailureMessage(apiError(401, {}, "unauthorized"))).toContain("ya no es válido");
    expect(uploadFailureMessage(new TypeError("Failed to fetch"))).toBe(UPLOAD_CONNECTION_MESSAGE);
    expect(uploadFailureMessage(new DOMException("x", "AbortError"))).toBe(UPLOAD_TIMEOUT_MESSAGE);
    expect(uploadFailureMessage(new Error("Parte 2: el almacenamiento rechazó la subida."))).toBe(
      "Parte 2: el almacenamiento rechazó la subida.",
    );
  });
});

// PUB-93: ~25 s at 95 % while confirm was retried, with no feedback.
describe("confirm retries", () => {
  it("announces each retry and stops at the deadline", async () => {
    vi.useFakeTimers();
    try {
      const onRetry = vi.fn();
      const operation = vi.fn().mockRejectedValue(apiError(503, {}, "unavailable"));
      const pending = withRetry(operation, 5, 1000, { onRetry, deadlineMs: 3500 }).catch((e) => e);
      await vi.runAllTimersAsync();
      const error = await pending;
      expect(error).toBeInstanceOf(ApiFetchError);
      // 1 s + 2 s fit in 3.5 s; the next 4 s wait would not.
      expect(operation).toHaveBeenCalledTimes(3);
      expect(onRetry.mock.calls).toEqual([
        [2, 5],
        [3, 5],
      ]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("labels the retry in Spanish", () => {
    expect(confirmRetrySubtitle(2, 3)).toBe("Reintentando… (2 de 3)");
  });
});
