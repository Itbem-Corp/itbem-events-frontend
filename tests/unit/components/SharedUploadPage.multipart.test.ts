import { describe, it, expect } from "vitest";
import {
  calcParts,
  calcProgress,
  getPartConcurrency,
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
