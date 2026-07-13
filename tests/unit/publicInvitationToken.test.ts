import { describe, expect, it } from "vitest";
import { readPublicInvitationToken } from "../../src/lib/publicInvitationToken";

describe("readPublicInvitationToken", () => {
  it("reads and trims the public invitation token from the query string", () => {
    expect(readPublicInvitationToken("?token=%20ABC%2F123%20")).toBe("ABC/123");
  });

  it("accepts pretty token aliases used by RSVP links", () => {
    expect(readPublicInvitationToken("?pretty_token=%20PRETTY%2F123%20")).toBe(
      "PRETTY/123",
    );
    expect(readPublicInvitationToken("?prettyToken=CAMEL-123")).toBe(
      "CAMEL-123",
    );
    expect(readPublicInvitationToken("?PrettyToken=PASCAL-123")).toBe(
      "PASCAL-123",
    );
  });

  it("accepts explicit invitation token aliases used by integrations", () => {
    expect(readPublicInvitationToken("?invitation_token=%20INV%2F123%20")).toBe(
      "INV/123",
    );
    expect(readPublicInvitationToken("?invitationToken=INV-CAMEL")).toBe(
      "INV-CAMEL",
    );
    expect(readPublicInvitationToken("?InvitationToken=INV-PASCAL")).toBe(
      "INV-PASCAL",
    );
    expect(readPublicInvitationToken("?Token=RAW-PASCAL")).toBe("RAW-PASCAL");
  });

  it("prefers the canonical token query when multiple aliases exist", () => {
    expect(
      readPublicInvitationToken(
        "?pretty_token=PRETTY-123&invitation_token=INV-123&token=RAW-123",
      ),
    ).toBe("RAW-123");
  });

  it("reads invitation tokens from full public URLs", () => {
    expect(
      readPublicInvitationToken(
        "https://www.eventiapp.com.mx/e/mi-evento?token=invite%2F123",
      ),
    ).toBe("invite/123");
  });

  it("returns an empty string when the token is missing", () => {
    expect(readPublicInvitationToken("?preview=1")).toBe("");
  });
});
