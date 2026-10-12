import { describe, expect, it } from "vitest";

import { applyPublicResponseHeaders } from "../../src/lib/publicResponseHeaders";
import {
  CREDENTIAL_QUERY_KEYS,
  hasCredentialQuery,
  isPublicEventRoute,
} from "../../src/lib/publicRouteCredentials";

describe("public SSR response headers", () => {
  it("fails closed for credential-bearing invitations", () => {
    const response = new Response("ok");

    applyPublicResponseHeaders(response, true);

    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(response.headers.get("pragma")).toBe("no-cache");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("allows only bounded public caching without weakening referrers", () => {
    const response = new Response("ok");

    applyPublicResponseHeaders(response, false);

    expect(response.headers.get("cache-control")).toContain("s-maxage=120");
    expect(response.headers.get("referrer-policy")).toBe(
      "strict-origin-when-cross-origin",
    );
    expect(response.headers.has("pragma")).toBe(false);
  });
});

describe("public route credential detection", () => {
  it.each([
    "event_access_token",
    "eventAccessToken",
    "EventAccessToken",
    "access_token",
    "accessToken",
    "pretty_token",
    "prettyToken",
    "PrettyToken",
    "invitation_token",
    "invitationToken",
    "token",
    "Token",
    "preview_token",
    "previewToken",
    "preview",
    "t",
    "access",
  ])("treats ?%s= as a credential", (key) => {
    const params = new URLSearchParams({ [key]: "abc" });
    expect(hasCredentialQuery(params)).toBe(true);
  });

  it("does not flag ordinary query params", () => {
    expect(hasCredentialQuery(new URLSearchParams("utm_source=wa&e=boda"))).toBe(false);
  });

  it("has no duplicate keys", () => {
    expect(new Set(CREDENTIAL_QUERY_KEYS).size).toBe(CREDENTIAL_QUERY_KEYS.length);
  });

  it.each(["/e/boda", "/e/boda/momentos", "/rsvp/boda", "/events/upload", "/events/boda/upload"])(
    "covers %s",
    (path) => {
      expect(isPublicEventRoute(path)).toBe(true);
    },
  );

  it("leaves unrelated routes alone", () => {
    expect(isPublicEventRoute("/")).toBe(false);
    expect(isPublicEventRoute("/offline")).toBe(false);
  });

  it("makes tokenized moment and upload pages private", () => {
    const url = new URL("http://localhost/e/x/momentos?event_access_token=abc");
    const response = new Response("ok");
    applyPublicResponseHeaders(response, hasCredentialQuery(url.searchParams));
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  });
});
