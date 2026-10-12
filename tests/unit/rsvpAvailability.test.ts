import { describe, expect, it } from "vitest";

import { RSVP_CLOSED_MESSAGE } from "../../src/lib/apiError";
import {
  buildRsvpConfirmationRequest,
  normalizeInvitationPayload,
} from "../../src/lib/invitationData";
import {
  buildRsvpClosedMessage,
  clampRsvpText,
  readRsvpAvailability,
  RSVP_DIETARY_MAX_LENGTH,
} from "../../src/lib/rsvpAvailability";

describe("readRsvpAvailability", () => {
  it("treats missing fields as open", () => {
    expect(readRsvpAvailability({ data: { guest: {} } })).toEqual({
      open: true,
      deadline: null,
    });
    expect(readRsvpAvailability(null, undefined)).toEqual({ open: true, deadline: null });
  });

  it("reads rsvp_open false and the deadline from nested payloads", () => {
    expect(
      readRsvpAvailability({
        data: { event: { rsvp_open: false, rsvp_deadline: "2026-10-01T23:59:00Z" } },
      }),
    ).toEqual({ open: false, deadline: "2026-10-01T23:59:00Z" });
  });

  it("reads camelCase fields from normalised invitation data or section config", () => {
    expect(readRsvpAvailability({ rsvpOpen: false })).toMatchObject({ open: false });
    expect(readRsvpAvailability(null, { rsvp_open: "false" })).toMatchObject({ open: false });
  });

  it("ignores a null deadline and keeps open when rsvp_open is true", () => {
    expect(readRsvpAvailability({ rsvp_open: true, rsvp_deadline: null })).toEqual({
      open: true,
      deadline: null,
    });
  });
});

describe("buildRsvpClosedMessage", () => {
  it("formats the deadline in the event time zone", () => {
    const msg = buildRsvpClosedMessage("2026-10-02T05:30:00Z", "America/Mexico_City");
    expect(msg).toMatch(/^Las confirmaciones cerraron el 1 de octubre de 2026/);
    expect(msg).toContain("23:30");
  });

  it("falls back to the generic closed copy without a valid deadline", () => {
    expect(buildRsvpClosedMessage(null)).toBe(RSVP_CLOSED_MESSAGE);
    expect(buildRsvpClosedMessage("not a date")).toBe(RSVP_CLOSED_MESSAGE);
  });

  it("survives an invalid time zone", () => {
    expect(buildRsvpClosedMessage("2026-10-02T05:30:00Z", "Mars/Base")).toMatch(
      /^Las confirmaciones cerraron el /,
    );
  });
});

describe("invitation payload RSVP fields", () => {
  it("normalises rsvp_open and rsvp_deadline", () => {
    const data = normalizeInvitationPayload({
      data: {
        rsvp_open: false,
        rsvp_deadline: "2026-10-01T23:59:00Z",
        guest: { first_name: "Ana", rsvp_status: "pending" },
      },
    });
    expect(data.rsvpOpen).toBe(false);
    expect(data.rsvpDeadline).toBe("2026-10-01T23:59:00Z");
  });

  it("leaves rsvpOpen undefined (open) when the backend omits it", () => {
    const data = normalizeInvitationPayload({ data: { guest: { first_name: "Ana" } } });
    expect(data.rsvpOpen).toBeUndefined();
  });

  it("bounds dietary text to the backend column size", () => {
    const long = "á".repeat(300);
    const request = buildRsvpConfirmationRequest(
      { prettyToken: "ABC" },
      null,
      "confirmed",
      1,
      "",
      long,
    );
    expect(Array.from(request.dietary_restrictions ?? "").length).toBe(
      RSVP_DIETARY_MAX_LENGTH,
    );
  });

  it("clamps by code points", () => {
    expect(clampRsvpText("😀😀😀", 2)).toBe("😀😀");
    expect(clampRsvpText("abc", 5)).toBe("abc");
  });
});
