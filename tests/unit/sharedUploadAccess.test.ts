import { describe, expect, it } from "vitest";
import {
  getSharedUploadGate,
  isSharedUploadOpen,
} from "../../src/lib/sharedUploadAccess";

describe("isSharedUploadOpen", () => {
  it("requires both backend upload gates to be open", () => {
    expect(
      isSharedUploadOpen({
        allowUploads: true,
        shareUploadsEnabled: true,
      }),
    ).toBe(true);

    expect(
      isSharedUploadOpen({
        allowUploads: false,
        shareUploadsEnabled: true,
      }),
    ).toBe(false);

    expect(
      isSharedUploadOpen({
        allowUploads: true,
        shareUploadsEnabled: false,
      }),
    ).toBe(false);
  });
});

describe("getSharedUploadGate", () => {
  it("prioritizes the published wall screen over disabled uploads", () => {
    expect(
      getSharedUploadGate({
        uploadsNotEnabled: true,
        wallPublished: true,
        quotaLoaded: true,
        uploadsRemaining: 0,
      }),
    ).toBe("published");
  });

  it("shows disabled when shared uploads are closed before publishing", () => {
    expect(
      getSharedUploadGate({
        uploadsNotEnabled: true,
        wallPublished: false,
        quotaLoaded: true,
        uploadsRemaining: 3,
      }),
    ).toBe("disabled");
  });

  it("shows the quota gate after availability checks pass", () => {
    expect(
      getSharedUploadGate({
        uploadsNotEnabled: false,
        wallPublished: false,
        quotaLoaded: true,
        uploadsRemaining: 0,
      }),
    ).toBe("limit-reached");
  });

  it("leaves the upload page open while no gate applies", () => {
    expect(
      getSharedUploadGate({
        uploadsNotEnabled: false,
        wallPublished: false,
        quotaLoaded: true,
        uploadsRemaining: 2,
      }),
    ).toBeNull();
  });
});
