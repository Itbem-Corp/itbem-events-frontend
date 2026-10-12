import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { RSVP_PERSONAL_LINK_HINT } from "../../src/lib/rsvpAvailability";

// PUB-19..22, STU-24, EVT-101: an anonymous visitor on a shared event page saw
// a red "necesita un token personal… invitacion" as if something was broken.
describe("RSVP without a personal link", () => {
  it("uses friendly Spanish guidance without technical words", () => {
    expect(RSVP_PERSONAL_LINK_HINT).not.toMatch(/token/i);
    expect(RSVP_PERSONAL_LINK_HINT).toContain("confirmar tu asistencia");
    expect(RSVP_PERSONAL_LINK_HINT).toContain("enlace personal");
  });

  it("renders the hint in the section body color, not as a red error", () => {
    const source = readFileSync(
      fileURLToPath(
        new URL("../../src/components/sections/RSVPConfirmation.tsx", import.meta.url),
      ),
      "utf8",
    );
    const block = source.slice(
      source.indexOf('token === ""'),
      source.indexOf("{RSVP_PERSONAL_LINK_HINT}"),
    );
    expect(block).toContain("style={themedBodyStyle}");
    expect(block).not.toMatch(/text-red/);
    expect(source).not.toContain("token personal");
  });
});
