import { describe, expect, it } from "vitest";
import {
  buildTrackViewUrl,
  viewTrackingWasAccepted,
  viewTrackingSessionKey,
} from "../../src/lib/eventTrackingUrl";

describe("buildTrackViewUrl", () => {
  it("builds a public tracking URL without token", () => {
    expect(buildTrackViewUrl("https://api.example.com", "mi evento")).toBe(
      "https://api.example.com/api/events/mi%20evento/view",
    );
  });

  it("adds the invitation token when present", () => {
    expect(
      buildTrackViewUrl("https://api.example.com/", "mi-evento", " ABC123 "),
    ).toBe("https://api.example.com/api/events/mi-evento/view?token=ABC123");
  });

  it("scopes the session marker by backend, identifier, and invitation token", () => {
    const publicKey = viewTrackingSessionKey(
      "https://api.example.com/",
      "mi-evento",
    );
    const publicKeyWithoutSlash = viewTrackingSessionKey(
      "https://api.example.com",
      "mi-evento",
    );
    const publicKeyWithApiSuffix = viewTrackingSessionKey(
      "https://api.example.com/api///",
      "mi-evento",
    );
    const invitedKey = viewTrackingSessionKey(
      "https://api.example.com/",
      "mi-evento",
      "ABC123",
    );
    const stagingKey = viewTrackingSessionKey(
      "https://staging.example.com/",
      "mi-evento",
    );

    expect(publicKey).toMatch(/^view-tracked-[a-z0-9]+$/);
    expect(publicKey).toBe(publicKeyWithoutSlash);
    expect(publicKey).toBe(publicKeyWithApiSuffix);
    expect(invitedKey).not.toBe(publicKey);
    expect(stagingKey).not.toBe(publicKey);
    expect(invitedKey).not.toContain("ABC123");
    expect(publicKey).not.toContain("mi-evento");
  });
});

describe("viewTrackingWasAccepted", () => {
  it("reads the explicit backend tracking contract", () => {
    expect(
      viewTrackingWasAccepted({
        status: 200,
        data: { tracked: true },
      }),
    ).toBe(true);
    expect(
      viewTrackingWasAccepted({
        status: 200,
        data: { tracked: false },
      }),
    ).toBe(false);
  });

  it("accepts Pascal-cased Go envelopes and string booleans", () => {
    expect(
      viewTrackingWasAccepted({
        Status: 200,
        Data: { Tracked: "false" },
      }),
    ).toBe(false);
    expect(viewTrackingWasAccepted({ Tracked: "true" })).toBe(true);
  });

  it("treats legacy success payloads as accepted", () => {
    expect(viewTrackingWasAccepted({ status: 200, data: null })).toBe(true);
    expect(viewTrackingWasAccepted(undefined)).toBe(true);
  });
});
