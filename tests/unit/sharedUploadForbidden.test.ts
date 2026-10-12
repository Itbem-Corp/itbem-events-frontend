import { describe, expect, it } from "vitest";

import {
  releaseForbiddenEntries,
  SHARED_UPLOAD_FORBIDDEN_ENTRY_MESSAGE,
  type SharedUploadFileEntry,
} from "../../src/components/shared-upload/SharedUploadEngine";
import {
  getSharedUploadGate,
  resolveForbiddenUploadOutcome,
} from "../../src/lib/sharedUploadAccess";

const open = { uploadsNotEnabled: false, wallPublished: false, uploadsRemaining: 5 };

describe("resolveForbiddenUploadOutcome (PUB-5)", () => {
  it("acknowledges files that were already uploaded", () => {
    expect(resolveForbiddenUploadOutcome(2, { ...open, wallPublished: true })).toBe(
      "acknowledge-uploaded",
    );
    expect(resolveForbiddenUploadOutcome(1, null)).toBe("acknowledge-uploaded");
  });

  it("shows the published screen when the wall was just published", () => {
    const status = { ...open, wallPublished: true };
    expect(resolveForbiddenUploadOutcome(0, status)).toBe("show-gate");
    expect(getSharedUploadGate({ ...status, quotaLoaded: true })).toBe("published");
  });

  it("shows the limit screen when the guest ran out of uploads", () => {
    const status = { ...open, uploadsRemaining: 0 };
    expect(resolveForbiddenUploadOutcome(0, status)).toBe("show-gate");
    expect(getSharedUploadGate({ ...status, quotaLoaded: true })).toBe("limit-reached");
  });

  it("shows coming soon only when uploads really are disabled", () => {
    const status = { ...open, uploadsNotEnabled: true };
    expect(resolveForbiddenUploadOutcome(0, status)).toBe("show-gate");
    expect(getSharedUploadGate({ ...status, quotaLoaded: true })).toBe("disabled");
  });

  it("lets the guest retry when the status says uploads are open", () => {
    expect(resolveForbiddenUploadOutcome(0, open)).toBe("retry");
  });

  it("defers to the status error screen when the re-check failed", () => {
    expect(resolveForbiddenUploadOutcome(0, null)).toBe("status-unavailable");
  });
});

describe("releaseForbiddenEntries (PUB-5)", () => {
  function entry(id: string, status: SharedUploadFileEntry["status"]): SharedUploadFileEntry {
    return {
      id,
      file: {} as File,
      previewUrl: "",
      isVideo: false,
      isHeic: false,
      status,
      progress: status === "uploading" ? 40 : undefined,
    };
  }

  it("never leaves entries spinning after a 403", () => {
    const result = releaseForbiddenEntries([
      entry("a", "done"),
      entry("b", "uploading"),
      entry("c", "pending"),
    ]);
    expect(result.map((e) => e.status)).toEqual(["done", "error", "pending"]);
    expect(result[1].errorMsg).toBe(SHARED_UPLOAD_FORBIDDEN_ENTRY_MESSAGE);
    expect(result[1].progress).toBeUndefined();
  });
});
