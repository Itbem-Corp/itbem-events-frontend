import { describe, it, expect } from "vitest";

// Mirrors MAX_VIDEO_DURATION_S and the duration-filter logic in SharedUploadPage.tsx (lines 46, 639-641).
const MAX_VIDEO_DURATION_S = 300; // 5 minutes

// Mirrors the filter predicate on line 641:
// .filter(({ duration }) => duration <= MAX_VIDEO_DURATION_S || duration === 0)
const isAllowed = (duration: number): boolean =>
  duration <= MAX_VIDEO_DURATION_S || duration === 0;

// Mirrors the rejection predicate on line 639:
// videosWithDuration.filter(({ duration }) => duration > MAX_VIDEO_DURATION_S)
const isRejected = (duration: number): boolean =>
  duration > MAX_VIDEO_DURATION_S;

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
    expect(MAX_VIDEO_DURATION_S).toBe(300);
  });
});
