import { describe, it, expect } from "vitest";
import {
  isSharedUploadVideoDurationAllowed as isAllowed,
  MAX_SHARED_UPLOAD_VIDEO_DURATION_S,
} from "../../src/components/shared-upload/SharedUploadEngine";

const isRejected = (duration: number): boolean => !isAllowed(duration);

describe("video duration limit (MAX_VIDEO_DURATION_S = 300 s)", () => {
  it("allows a 1-second video", () => {
    expect(isAllowed(1)).toBe(true);
  });

  it("allows a 60-second video", () => {
    expect(isAllowed(60)).toBe(true);
  });

  it("allows a 299-second video (just under 5 min)", () => {
    expect(isAllowed(299)).toBe(true);
  });

  it("allows exactly 300 seconds (exactly 5 min)", () => {
    expect(isAllowed(300)).toBe(true);
    expect(isRejected(300)).toBe(false);
  });

  it("rejects 301 seconds (just over 5 min)", () => {
    expect(isRejected(301)).toBe(true);
    expect(isAllowed(301)).toBe(false);
  });

  it("rejects 600 seconds (10 min)", () => {
    expect(isRejected(600)).toBe(true);
  });

  it("allows duration 0 — treated as unknown, backend size limit acts as proxy", () => {
    // When getVideoDuration() fails to read metadata it returns 0.
    // The upload flow lets these through rather than silently dropping them.
    expect(isAllowed(0)).toBe(true);
    expect(isRejected(0)).toBe(false);
  });

  it("MAX_VIDEO_DURATION_S constant is exactly 300", () => {
    expect(MAX_SHARED_UPLOAD_VIDEO_DURATION_S).toBe(300);
  });
});
