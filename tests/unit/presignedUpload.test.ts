import { describe, expect, it } from "vitest";
import { classifyPresignedUploadStatus } from "../../src/lib/presignedUpload";

describe("presignedUpload", () => {
  it("treats bucket endpoint redirects as permanent configuration failures", () => {
    expect(classifyPresignedUploadStatus(301)).toMatchObject({
      kind: "redirect",
      retryable: false,
    });
  });

  it("asks for a fresh signed URL after authorization expiry", () => {
    expect(classifyPresignedUploadStatus(403)).toMatchObject({
      kind: "expired",
      retryable: false,
    });
  });

  it.each([408, 425, 429, 500, 503])(
    "retries transient status %s",
    (status) => {
      expect(classifyPresignedUploadStatus(status).retryable).toBe(true);
    },
  );

  it("does not retry unsupported client failures", () => {
    expect(classifyPresignedUploadStatus(400)).toMatchObject({
      kind: "unknown",
      retryable: false,
    });
  });
});
