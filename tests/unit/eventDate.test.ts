import { describe, expect, it } from "vitest";

import {
  formatPublicEventDate,
  parsePublicEventDate,
} from "../../src/lib/eventDate";

describe("eventDate", () => {
  it("formats date-only backend values without timezone drift", () => {
    expect(formatPublicEventDate("2026-08-15")).toBe("15 de agosto de 2026");
  });

  it("formats full ISO datetimes from Go JSON", () => {
    expect(formatPublicEventDate("2026-08-15T20:30:00Z")).toBe(
      "15 de agosto de 2026",
    );
  });

  it("formats full ISO datetimes in the event timezone when provided", () => {
    expect(
      formatPublicEventDate("2026-08-16T02:30:00Z", "America/Mexico_City"),
    ).toBe("15 de agosto de 2026");
  });

  it("falls back when the event timezone is invalid", () => {
    expect(formatPublicEventDate("2026-08-15T20:30:00Z", "bad/timezone")).toBe(
      "15 de agosto de 2026",
    );
  });

  it("returns empty values for invalid dates", () => {
    expect(formatPublicEventDate("not-a-date")).toBe("");
    expect(parsePublicEventDate("not-a-date")).toBeNull();
  });

  it("treats Go zero timestamps as absent public dates", () => {
    expect(formatPublicEventDate("0001-01-01T00:00:00Z")).toBe("");
    expect(parsePublicEventDate("0001-01-01T00:00:00Z")).toBeNull();
  });
});
