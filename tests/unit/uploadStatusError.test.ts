import { describe, expect, it } from "vitest";

import { ApiFetchError } from "../../src/lib/apiFetch";
import { classifyUploadStatusError } from "../../src/lib/uploadStatusError";

describe("classifyUploadStatusError", () => {
  it.each([
    [401, "unauthorized"],
    [403, "forbidden"],
    [404, "not-found"],
    [400, "invalid"],
    [422, "invalid"],
    [408, "transient"],
    [425, "transient"],
    [429, "transient"],
    [503, "transient"],
  ] as const)("maps HTTP %s to %s", (status, kind) => {
    expect(
      classifyUploadStatusError(new ApiFetchError("failed", status, null)),
    ).toMatchObject({ kind, message: "failed" });
  });

  it("treats network failures as transient", () => {
    expect(classifyUploadStatusError(new TypeError("network down"))).toEqual({
      kind: "transient",
      message: "network down",
    });
  });
});
