import { describe, expect, it } from "vitest";
import {
  hasPublicAccessCredential,
  PUBLIC_ACCESS_CREDENTIAL_QUERY_KEYS,
  PUBLIC_ACCESS_DISPLAY_QUERY_KEYS,
  PUBLIC_EVENT_ACCESS_HEADER_NAME,
  PUBLIC_EVENT_ACCESS_TOKEN_QUERY_KEYS,
  PUBLIC_INVITATION_TOKEN_QUERY_KEYS,
  PUBLIC_PREVIEW_CACHE_KEY_QUERY_KEY,
  PUBLIC_PREVIEW_MODE_QUERY_KEY,
  PUBLIC_PREVIEW_TOKEN_QUERY_KEYS,
} from "../../src/lib/publicAccessParams";

describe("publicAccessParams", () => {
  it("tracks backend-supported public access query aliases", () => {
    expect([...PUBLIC_INVITATION_TOKEN_QUERY_KEYS]).toEqual([
      "token",
      "Token",
      "invitation_token",
      "invitationToken",
      "InvitationToken",
      "pretty_token",
      "prettyToken",
      "PrettyToken",
    ]);
    expect([...PUBLIC_PREVIEW_TOKEN_QUERY_KEYS]).toEqual([
      "preview_token",
      "previewToken",
      "PreviewToken",
    ]);
    expect([...PUBLIC_EVENT_ACCESS_TOKEN_QUERY_KEYS]).toEqual([
      "event_access_token",
      "eventAccessToken",
      "EventAccessToken",
    ]);
  });

  it("groups public display params while keeping preview cache keys explicit", () => {
    expect(PUBLIC_PREVIEW_MODE_QUERY_KEY).toBe("preview");
    expect(PUBLIC_PREVIEW_CACHE_KEY_QUERY_KEY).toBe("t");
    expect([...PUBLIC_ACCESS_DISPLAY_QUERY_KEYS]).toEqual([
      PUBLIC_PREVIEW_MODE_QUERY_KEY,
      PUBLIC_PREVIEW_CACHE_KEY_QUERY_KEY,
      ...PUBLIC_PREVIEW_TOKEN_QUERY_KEYS,
      ...PUBLIC_INVITATION_TOKEN_QUERY_KEYS,
      ...PUBLIC_EVENT_ACCESS_TOKEN_QUERY_KEYS,
    ]);
    expect(PUBLIC_EVENT_ACCESS_HEADER_NAME).toBe("X-Event-Access-Token");
  });

  it("detects every credential alias without treating display-only params as secrets", () => {
    for (const key of PUBLIC_ACCESS_CREDENTIAL_QUERY_KEYS) {
      expect(hasPublicAccessCredential(new URLSearchParams([[key, "secret"]]))).toBe(true);
    }
    expect(hasPublicAccessCredential(new URLSearchParams("preview=1&t=42"))).toBe(false);
    expect(hasPublicAccessCredential(new URLSearchParams())).toBe(false);
  });
});
