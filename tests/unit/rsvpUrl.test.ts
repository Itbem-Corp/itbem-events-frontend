import { describe, expect, it } from "vitest";
import {
  buildPublicRsvpUrl,
  publicBaseUrlFromLocation,
  publicBaseUrlFromEventoPath,
  publicRsvpIdentifierFromLocation,
  publicRsvpIdentifierFromPath,
} from "../../src/lib/rsvpUrl";

describe("buildPublicRsvpUrl", () => {
  it("builds the public RSVP URL from an origin", () => {
    expect(buildPublicRsvpUrl("https://www.eventiapp.com.mx", "ABC123")).toBe(
      "https://www.eventiapp.com.mx/evento?token=ABC123",
    );
  });

  it("trims the base origin and token while encoding URL-sensitive characters", () => {
    expect(
      buildPublicRsvpUrl(
        " https://www.eventiapp.com.mx/ ",
        " token/123 +# ",
      ),
    ).toBe("https://www.eventiapp.com.mx/evento?token=token%2F123%20%2B%23");
  });

  it("preserves public frontend subpaths from the /evento route", () => {
    const publicBaseUrl = publicBaseUrlFromEventoPath(
      "https://preview.example.com",
      "/eventi-public/evento",
    );

    expect(publicBaseUrl).toBe("https://preview.example.com/eventi-public");
    expect(buildPublicRsvpUrl(publicBaseUrl, "ABC123")).toBe(
      "https://preview.example.com/eventi-public/evento?token=ABC123",
    );
  });

  it("builds identifier RSVP URLs when an event identifier is available", () => {
    expect(
      buildPublicRsvpUrl(
        "https://www.eventiapp.com.mx",
        " token/123 ",
        " mi%20evento ",
      ),
    ).toBe("https://www.eventiapp.com.mx/rsvp/mi%20evento?token=token%2F123");
  });

  it("preserves public frontend subpaths from /rsvp identifier routes", () => {
    const publicBaseUrl = publicBaseUrlFromEventoPath(
      "https://preview.example.com",
      "/eventi-public/rsvp/mi-evento",
    );

    expect(publicBaseUrl).toBe("https://preview.example.com/eventi-public");
    expect(publicRsvpIdentifierFromPath("/eventi-public/rsvp/mi%20evento")).toBe(
      "mi evento",
    );
  });

  it("preserves public frontend subpaths and identifiers from /e routes", () => {
    const publicBaseUrl = publicBaseUrlFromEventoPath(
      "https://preview.example.com",
      "/eventi-public/e/mi%20evento",
    );
    const identifier = publicRsvpIdentifierFromPath(
      "/eventi-public/e/mi%20evento",
    );

    expect(publicBaseUrl).toBe("https://preview.example.com/eventi-public");
    expect(identifier).toBe("mi evento");
    expect(buildPublicRsvpUrl(publicBaseUrl, "ABC123", identifier)).toBe(
      "https://preview.example.com/eventi-public/rsvp/mi%20evento?token=ABC123",
    );
  });

  it("derives public URLs from browser location without using the API origin", () => {
    const location = {
      origin: "https://preview.example.com",
      pathname: "/eventi-public/e/mi%20evento",
    };

    expect(publicBaseUrlFromLocation(location)).toBe(
      "https://preview.example.com/eventi-public",
    );
    expect(publicRsvpIdentifierFromLocation(location)).toBe("mi evento");
    expect(
      buildPublicRsvpUrl(
        publicBaseUrlFromLocation(location),
        "ABC123",
        publicRsvpIdentifierFromLocation(location),
      ),
    ).toBe("https://preview.example.com/eventi-public/rsvp/mi%20evento?token=ABC123");
  });

  it("falls back to relative public RSVP URLs when no browser location exists", () => {
    expect(publicBaseUrlFromLocation(undefined)).toBe("");
    expect(publicRsvpIdentifierFromLocation(undefined)).toBe("");
    expect(buildPublicRsvpUrl(publicBaseUrlFromLocation(undefined), "ABC123")).toBe(
      "/evento?token=ABC123",
    );
  });
});
