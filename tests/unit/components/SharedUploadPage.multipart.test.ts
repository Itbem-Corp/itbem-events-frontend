import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  calcParts,
  calcProgress,
  createStallWatchdog,
  getPartConcurrency,
  PROGRESS_STALL_MS,
} from "../../../src/components/shared-upload/SharedUploadEngine";

describe("calcParts", () => {
  it("produces correct part count for exact multiple", () => {
    const parts = calcParts(24 * 1024 * 1024, 8 * 1024 * 1024); // 3 parts exactly
    expect(parts).toHaveLength(3);
    expect(parts[0]).toEqual({ partNumber: 1, start: 0, end: 8 * 1024 * 1024 });
    expect(parts[2].end).toBe(24 * 1024 * 1024);
  });

  it("produces correct part count for non-exact size", () => {
    const parts = calcParts(20 * 1024 * 1024, 8 * 1024 * 1024); // 3 parts, last is 4 MB
    expect(parts).toHaveLength(3);
    expect(parts[2].end - parts[2].start).toBe(4 * 1024 * 1024);
  });

  it("handles single-part file", () => {
    const parts = calcParts(5 * 1024 * 1024, 8 * 1024 * 1024);
    expect(parts).toHaveLength(1);
    expect(parts[0]).toEqual({ partNumber: 1, start: 0, end: 5 * 1024 * 1024 });
  });
});

describe("calcProgress", () => {
  it("returns 0 when nothing uploaded", () => {
    expect(calcProgress([0, 0, 0], 24 * 1024 * 1024)).toBe(0);
  });

  it("returns 90 when all bytes uploaded", () => {
    const total = 24 * 1024 * 1024;
    expect(calcProgress([8 * 1024 * 1024, 8 * 1024 * 1024, 8 * 1024 * 1024], total)).toBe(90);
  });

  it("is proportional mid-upload", () => {
    const total = 8 * 1024 * 1024;
    const pct = calcProgress([4 * 1024 * 1024], total); // 50% uploaded
    expect(pct).toBe(45); // 50% * 90 = 45
  });

  it("returns 0 for an empty file and caps at 90", () => {
    expect(calcProgress([], 0)).toBe(0);
    expect(calcProgress([30], 10)).toBe(90);
  });

  it("moves with sub-part byte progress (smooth, never regresses on retry-free growth)", () => {
    const total = 16 * 1024 * 1024;
    const a = calcProgress([1024 * 1024, 0], total);
    const b = calcProgress([4 * 1024 * 1024, 0], total);
    expect(b).toBeGreaterThan(a);
  });
});

describe("calcProgress during a part retry", () => {
  it("holds the shown value when a retried part restarts at 0 bytes", () => {
    const part = 8 * 1024 * 1024;
    const total = 3 * part;
    const bytes = [part, part / 2, 0];
    const shown = calcProgress(bytes, total); // 45
    expect(shown).toBe(45);
    // Part 2 fails and withRetry restarts it: its bytes go back to 0.
    bytes[1] = 0;
    expect(calcProgress(bytes, total, shown)).toBe(shown);
    // The retry catches up past the old value and the bar moves again.
    bytes[1] = part;
    expect(calcProgress(bytes, total, shown)).toBe(60);
  });

  it("never passes 90 even with a floor above it", () => {
    expect(calcProgress([1], 10, 95)).toBe(90);
    expect(calcProgress([], 0, 40)).toBe(40);
  });
});

describe("createStallWatchdog", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("reports a stall after PROGRESS_STALL_MS without a touch, and resumes on the next touch", () => {
    const onStall = vi.fn();
    const onResume = vi.fn();
    const watchdog = createStallWatchdog(onStall, onResume);
    watchdog.touch();
    vi.advanceTimersByTime(PROGRESS_STALL_MS - 1);
    expect(onStall).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onStall).toHaveBeenCalledTimes(1);
    watchdog.touch();
    expect(onResume).toHaveBeenCalledTimes(1);
    watchdog.stop();
  });

  it("stays quiet while touched more often than the limit", () => {
    const onStall = vi.fn();
    const watchdog = createStallWatchdog(onStall, vi.fn());
    for (let i = 0; i < 5; i += 1) {
      watchdog.touch();
      vi.advanceTimersByTime(PROGRESS_STALL_MS - 1000);
    }
    expect(onStall).not.toHaveBeenCalled();
    watchdog.stop();
  });

  it("never fires after stop", () => {
    const onStall = vi.fn();
    const watchdog = createStallWatchdog(onStall, vi.fn());
    watchdog.touch();
    watchdog.stop();
    vi.advanceTimersByTime(PROGRESS_STALL_MS * 3);
    expect(onStall).not.toHaveBeenCalled();
  });
});

describe("calcParts part size", () => {
  it("keeps every part at or below the backend part size and covers the file", () => {
    const size = 200 * 1024 * 1024;
    const parts = calcParts(size, 8 * 1024 * 1024);
    expect(parts).toHaveLength(25);
    expect(parts.every((p) => p.end - p.start <= 8 * 1024 * 1024)).toBe(true);
    expect(parts.at(-1)?.end).toBe(size);
  });

  it("returns no parts for an empty file", () => {
    expect(calcParts(0, 8 * 1024 * 1024)).toEqual([]);
  });
});

describe("getPartConcurrency", () => {
  it("keeps 4 without connection data", () => {
    expect(getPartConcurrency(undefined)).toBe(4);
    expect(getPartConcurrency({})).toBe(4);
  });

  it("reduces on 2g and 3g", () => {
    expect(getPartConcurrency({ effectiveType: "slow-2g" })).toBe(1);
    expect(getPartConcurrency({ effectiveType: "2g" })).toBe(1);
    expect(getPartConcurrency({ effectiveType: "3g" })).toBe(2);
  });

  it("keeps 4 on 4g", () => {
    expect(getPartConcurrency({ effectiveType: "4g" })).toBe(4);
  });
});
