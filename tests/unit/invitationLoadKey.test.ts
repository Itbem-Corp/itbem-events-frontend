import { describe, expect, it } from "vitest";
import { buildInvitationLoadKey } from "../../src/lib/invitationLoadKey";

describe("buildInvitationLoadKey", () => {
  it("normalizes backend URL and token into a stable load key", () => {
    expect(
      buildInvitationLoadKey("https://api.example.com/api/", " TOKEN/123 "),
    ).toBe("https://api.example.com/|TOKEN/123");
  });

  it("returns an empty key when token is missing", () => {
    expect(buildInvitationLoadKey("https://api.example.com", "")).toBe("");
    expect(buildInvitationLoadKey("https://api.example.com", "   ")).toBe("");
    expect(buildInvitationLoadKey("https://api.example.com", null)).toBe("");
  });

  it("keeps different invitation tokens as different load keys", () => {
    expect(buildInvitationLoadKey("https://api.example.com", "TOKEN-A")).not.toBe(
      buildInvitationLoadKey("https://api.example.com", "TOKEN-B"),
    );
  });
});
