import { describe, expect, it, vi } from "vitest";
import { ApiFetchError } from "../../src/lib/apiFetch";
import {
  isRetryableUploadApiError,
  retryUploadApiOnce,
} from "../../src/lib/uploadRetry";

describe("isRetryableUploadApiError", () => {
  it("retries network and server failures", () => {
    expect(isRetryableUploadApiError(new TypeError("network failed"))).toBe(
      true,
    );
    expect(
      isRetryableUploadApiError(new ApiFetchError("server", 500, null)),
    ).toBe(true);
  });

  it("does not retry client API failures", () => {
    expect(
      isRetryableUploadApiError(new ApiFetchError("bad request", 400, null)),
    ).toBe(false);
    expect(
      isRetryableUploadApiError(new ApiFetchError("disabled", 403, null)),
    ).toBe(false);
    expect(
      isRetryableUploadApiError(
        new DOMException("cancelled", "AbortError"),
      ),
    ).toBe(false);
  });
});

describe("retryUploadApiOnce", () => {
  it("reuses the same upload API operation on a retryable failure", async () => {
    const operation = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new ApiFetchError("temporary", 500, null))
      .mockResolvedValueOnce("ok");

    await expect(retryUploadApiOnce(operation, 0)).resolves.toBe("ok");
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it("does not retry non-retryable upload API failures", async () => {
    const operation = vi
      .fn<() => Promise<string>>()
      .mockRejectedValue(new ApiFetchError("invalid", 422, null));

    await expect(retryUploadApiOnce(operation, 0)).rejects.toThrow("invalid");
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it("cancels the retry delay when the upload is aborted", async () => {
    const controller = new AbortController();
    const operation = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new ApiFetchError("temporary", 500, null))
      .mockResolvedValueOnce("unexpected");

    const retry = retryUploadApiOnce(operation, 2000, controller.signal);
    await Promise.resolve();
    controller.abort();

    await expect(retry).rejects.toMatchObject({ name: "AbortError" });
    expect(operation).toHaveBeenCalledTimes(1);
  });
});
