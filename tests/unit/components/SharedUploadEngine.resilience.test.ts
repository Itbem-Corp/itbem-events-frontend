import { describe, expect, it, vi } from "vitest";
import {
  collectConnectionAbortedEntryIds,
  normalizeConnectionAbortedEntries,
  SHARED_UPLOAD_CONNECTION_ERROR_MESSAGE,
  withRetry,
  type SharedUploadFileEntry,
} from "../../../src/components/shared-upload/SharedUploadEngine";
import { PresignedUploadError } from "../../../src/lib/presignedUpload";

function entry(
  id: string,
  status: SharedUploadFileEntry["status"],
): SharedUploadFileEntry {
  return {
    id,
    file: new File([id], `${id}.txt`, { type: "text/plain" }),
    previewUrl: `blob:${id}`,
    isVideo: false,
    isHeic: false,
    status,
    progress: status === "uploading" ? 40 : undefined,
    subtitle: status === "uploading" ? "Subiendo..." : undefined,
  };
}

describe("shared upload connection resilience", () => {
  it("includes entries still waiting for presign or multipart start in a connection abort", () => {
    const abortedIds = collectConnectionAbortedEntryIds(
      ["active-xhr"],
      ["queued-put"],
      ["waiting-for-presign"],
    );

    expect([...abortedIds]).toEqual([
      "active-xhr",
      "queued-put",
      "waiting-for-presign",
    ]);
  });

  it("moves internally aborted uploads to error without overwriting completed files", () => {
    const uploading = entry("uploading", "uploading");
    const done = entry("done", "done");
    const pending = entry("pending", "pending");

    const result = normalizeConnectionAbortedEntries(
      [uploading, done, pending],
      new Set([uploading.id, done.id]),
    );

    expect(result[0]).toMatchObject({
      status: "error",
      errorMsg: SHARED_UPLOAD_CONNECTION_ERROR_MESSAGE,
      progress: undefined,
      subtitle: undefined,
    });
    expect(result[1]).toBe(done);
    expect(result[2]).toBe(pending);
  });

  it("does not retry permanent ETag/CORS failures", async () => {
    const permanentError = Object.assign(
      new Error("S3 no devolvió ETag; revisa ExposeHeaders de CORS"),
      { permanent: true },
    );
    const operation = vi.fn().mockRejectedValue(permanentError);

    await expect(withRetry(operation, 3, 0)).rejects.toBe(permanentError);
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it("retries transient connection failures before failing the batch", async () => {
    const operation = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("network down"))
      .mockResolvedValue("ok");

    await expect(withRetry(operation, 3, 0)).resolves.toBe("ok");
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it("does not retry a permanent bucket endpoint redirect", async () => {
    const redirectError = new PresignedUploadError(
      "bucket endpoint mismatch",
      "redirect",
      false,
      301,
    );
    const operation = vi.fn().mockRejectedValue(redirectError);

    await expect(withRetry(operation, 3, 0)).rejects.toBe(redirectError);
    expect(operation).toHaveBeenCalledTimes(1);
  });
});
