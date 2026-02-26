import { describe, it, expect } from "vitest";

// Pure helper: calculates part boundaries for a file.
// Returns array of { partNumber, start, end } — end is exclusive.
function calcParts(fileSize: number, partSize: number): Array<{ partNumber: number; start: number; end: number }> {
  const parts: Array<{ partNumber: number; start: number; end: number }> = [];
  let offset = 0;
  let partNumber = 1;
  while (offset < fileSize) {
    const end = Math.min(offset + partSize, fileSize);
    parts.push({ partNumber, start: offset, end });
    offset = end;
    partNumber++;
  }
  return parts;
}

// Pure helper: computes overall progress percentage from per-part byte counters.
// Returns 0-90 (last 10% reserved for /complete round-trip).
function calcProgress(bytesPerPart: number[], totalBytes: number): number {
  if (totalBytes === 0) return 0;
  const uploaded = bytesPerPart.reduce((a, b) => a + b, 0);
  return Math.min(90, Math.round((uploaded / totalBytes) * 90));
}

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
});
