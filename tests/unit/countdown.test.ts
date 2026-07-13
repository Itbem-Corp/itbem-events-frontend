import { describe, expect, it } from "vitest";
import { calculateCountdownTimeLeft } from "../../src/lib/countdown";

describe("calculateCountdownTimeLeft", () => {
  it("calculates remaining time from absolute RFC3339 instants", () => {
    expect(
      calculateCountdownTimeLeft(
        "2026-08-15T20:30:00Z",
        new Date("2026-08-14T19:15:30Z"),
      ),
    ).toEqual({
      days: 1,
      hours: 1,
      minutes: 14,
      seconds: 30,
    });
  });

  it("returns zero values for expired or invalid dates", () => {
    expect(
      calculateCountdownTimeLeft(
        "2026-08-15T20:30:00Z",
        new Date("2026-08-16T00:00:00Z"),
      ),
    ).toEqual({ days: 0, hours: 0, minutes: 0, seconds: 0 });

    expect(calculateCountdownTimeLeft("not-a-date")).toEqual({
      days: 0,
      hours: 0,
      minutes: 0,
      seconds: 0,
    });
  });
});
