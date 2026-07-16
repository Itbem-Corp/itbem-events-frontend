import { describe, expect, it } from "vitest";

import { applyPublicResponseHeaders } from "../../src/lib/publicResponseHeaders";

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
