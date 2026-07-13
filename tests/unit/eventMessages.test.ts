import { describe, expect, it } from "vitest";
import {
  buildRsvpThankYouMessage,
  cleanEventMessage,
} from "../../src/lib/eventMessages";

describe("eventMessages", () => {
  it("uses the custom RSVP thank-you message when present", () => {
    expect(
      buildRsvpThankYouMessage(
        "2026-08-15T20:00:00Z",
        "Gracias por confirmar, nos vemos pronto",
      ),
    ).toBe("Gracias por confirmar, nos vemos pronto");
  });

  it("falls back to a dated RSVP thank-you message", () => {
    expect(buildRsvpThankYouMessage("2026-08-15T20:00:00Z")).toBe(
      "Gracias por confirmar tu asistencia\nNos vemos el 15 de agosto de 2026",
    );
  });

  it("does not render invalid or Go zero dates in fallback RSVP messages", () => {
    expect(buildRsvpThankYouMessage("not-a-date")).toBe(
      "Gracias por confirmar tu asistencia",
    );
    expect(buildRsvpThankYouMessage("0001-01-01T00:00:00Z")).toBe(
      "Gracias por confirmar tu asistencia",
    );
  });

  it("trims empty custom messages", () => {
    expect(cleanEventMessage("  ")).toBeUndefined();
    expect(cleanEventMessage("  Hola  ")).toBe("Hola");
  });
});
