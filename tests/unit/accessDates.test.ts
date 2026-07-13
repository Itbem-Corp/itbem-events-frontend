import { describe, expect, it } from "vitest";
import { formatPublicAccessDateTime } from "../../src/lib/accessDates";

describe("formatPublicAccessDateTime", () => {
  it("formats public access dates in the event timezone", () => {
    expect(
      formatPublicAccessDateTime(
        "2030-07-01T15:30:00Z",
        "America/Chicago",
        { weekday: true },
      ),
    ).toMatch(/lunes, 1 de julio de 2030, 10:30 a\.m\. GMT-5/i);
  });

  it("falls back safely when timezone is invalid", () => {
    expect(
      formatPublicAccessDateTime("2030-07-01T15:30:00Z", "bad/timezone"),
    ).toContain("2030");
  });

  it("keeps invalid date strings readable", () => {
    expect(formatPublicAccessDateTime("not-a-date", "America/Mexico_City")).toBe(
      "not-a-date",
    );
  });
});
