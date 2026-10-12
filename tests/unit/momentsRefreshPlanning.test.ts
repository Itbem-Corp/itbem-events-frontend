import { describe, expect, it } from "vitest";

import {
  boundedMediaRefreshDelay,
  cursorPaginationAfterReplace,
  getPublicMomentsRefreshDelay,
  PUBLIC_MOMENTS_MIN_MEDIA_REFRESH_INTERVAL_MS,
  publicMomentsRefreshWindowLimit,
} from "../../src/lib/publicMoments";
import type { PublicMoment } from "../../src/lib/publicMomentTypes";

function moment(id: string, expiresAt: string): PublicMoment {
  return {
    id,
    content_url: `https://cdn.example.com/${id}.jpg`,
    content_view_url: `https://cdn.example.com/${id}.jpg?sig=1`,
    content_view_url_expires_at: expiresAt,
  } as PublicMoment;
}

describe("media refresh window (PUB-2)", () => {
  it("covers every loaded moment, not just one page", () => {
    expect(publicMomentsRefreshWindowLimit(40, 25, 500)).toBe(40);
    expect(publicMomentsRefreshWindowLimit(130, 25, 500)).toBe(130);
  });

  it("asks for at least one page and never more than the backend cap", () => {
    expect(publicMomentsRefreshWindowLimit(0, 25, 500)).toBe(25);
    expect(publicMomentsRefreshWindowLimit(10, 25, 500)).toBe(25);
    expect(publicMomentsRefreshWindowLimit(900, 25, 500)).toBe(500);
    expect(publicMomentsRefreshWindowLimit(Number.NaN, 25, 500)).toBe(25);
  });

  it("after a full-window refresh, the delay only depends on fresh URLs", () => {
    const now = Date.parse("2026-10-11T12:00:00Z");
    const fresh = Array.from({ length: 40 }, (_, i) =>
      moment(`m${i}`, "2026-10-12T00:00:00Z"),
    );
    // Old behaviour: 25 fresh + 15 stale items kept an expiry in the past → 0.
    const mixed = [
      ...fresh.slice(0, 25),
      ...fresh.slice(25).map((m) => ({ ...m, content_view_url_expires_at: "2026-10-11T00:00:00Z" })),
    ];
    expect(getPublicMomentsRefreshDelay(mixed, now)).toBe(0);
    expect(getPublicMomentsRefreshDelay(fresh, now)).toBeGreaterThan(11 * 60 * 60 * 1000);
  });
});

describe("boundedMediaRefreshDelay (PUB-2 tight loop guard)", () => {
  const now = 1_000_000;

  it("uses the computed delay for the first refresh", () => {
    expect(boundedMediaRefreshDelay(0, null, now)).toBe(0);
    expect(boundedMediaRefreshDelay(5_000, null, now)).toBe(5_000);
  });

  it("never refreshes again before the minimum interval", () => {
    expect(boundedMediaRefreshDelay(0, now - 1_000, now)).toBe(
      PUBLIC_MOMENTS_MIN_MEDIA_REFRESH_INTERVAL_MS - 1_000,
    );
    expect(boundedMediaRefreshDelay(0, now, now)).toBe(
      PUBLIC_MOMENTS_MIN_MEDIA_REFRESH_INTERVAL_MS,
    );
  });

  it("keeps a longer computed delay and allows a refresh once the interval passed", () => {
    expect(boundedMediaRefreshDelay(3_600_000, now - 1_000, now)).toBe(3_600_000);
    expect(
      boundedMediaRefreshDelay(0, now - PUBLIC_MOMENTS_MIN_MEDIA_REFRESH_INTERVAL_MS - 1, now),
    ).toBe(0);
  });
});

describe("cursorPaginationAfterReplace (PUB-3)", () => {
  it("restarts from the fresh response cursor", () => {
    expect(cursorPaginationAfterReplace(20, "cursor-20", 500)).toEqual({
      nextCursor: "cursor-20",
      reachedEnd: false,
    });
  });

  it("marks the end when there is no further cursor or the cap is reached", () => {
    expect(cursorPaginationAfterReplace(20, undefined, 500)).toEqual({
      nextCursor: null,
      reachedEnd: true,
    });
    expect(cursorPaginationAfterReplace(20, "  ", 500)).toEqual({
      nextCursor: null,
      reachedEnd: true,
    });
    expect(cursorPaginationAfterReplace(500, "cursor-500", 500)).toEqual({
      nextCursor: null,
      reachedEnd: true,
    });
  });
});
