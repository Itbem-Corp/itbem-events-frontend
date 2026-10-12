import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  buildContentSecurityPolicy,
  loopbackHttpOrigin,
  PRODUCTION_CSP,
} from "../../src/lib/contentSecurityPolicy";

const PINNED_PRODUCTION_CSP =
  "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https:; img-src 'self' data: blob: https:; media-src 'self' blob: https:; font-src 'self' data: https:; connect-src 'self' https:; frame-src https:; frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'; upgrade-insecure-requests";

describe("production CSP is pinned", () => {
  it("is byte-identical to the pinned policy", () => {
    expect(PRODUCTION_CSP).toBe(PINNED_PRODUCTION_CSP);
  });

  it("matches the static public/_headers policy", () => {
    const headers = readFileSync(
      fileURLToPath(new URL("../../public/_headers", import.meta.url)),
      "utf8",
    );
    expect(headers).toContain(`Content-Security-Policy: ${PINNED_PRODUCTION_CSP}`);
  });

  it.each([
    "https://api.eventiapp.com.mx/",
    "http://localhost:18080/",
    "http://127.0.0.1:18080/",
    "",
    undefined,
  ])("a production build ignores PUBLIC_EVENTS_URL=%s", (eventsUrl) => {
    expect(buildContentSecurityPolicy({ dev: false, eventsUrl })).toBe(PINNED_PRODUCTION_CSP);
  });

  it("the middleware only relaxes it for dev builds", () => {
    const middleware = readFileSync(
      fileURLToPath(new URL("../../src/middleware.ts", import.meta.url)),
      "utf8",
    );
    expect(middleware).toContain("dev: import.meta.env.DEV === true");
  });
});

describe("dev build against the local stack", () => {
  it("allows the loopback API origin and drops the https upgrade", () => {
    const csp = buildContentSecurityPolicy({ dev: true, eventsUrl: "http://localhost:18080/" });
    expect(csp).toContain(
      "connect-src 'self' https: http://localhost:18080 ws://localhost:* ws://127.0.0.1:*",
    );
    expect(csp).toContain("img-src 'self' data: blob: https: http://localhost:18080");
    expect(csp).toContain("media-src 'self' blob: https: http://localhost:18080");
    expect(csp).not.toContain("upgrade-insecure-requests");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
  });

  it.each([
    ["http://localhost:18080/", "http://localhost:18080"],
    ["http://127.0.0.1:18080", "http://127.0.0.1:18080"],
    ["http://api.eventiapp.localhost:18080/", "http://api.eventiapp.localhost:18080"],
    ["http://[::1]:18080/", "http://[::1]:18080"],
  ])("accepts loopback %s", (url, origin) => {
    expect(loopbackHttpOrigin(url)).toBe(origin);
  });

  it.each([
    "https://localhost:18080/",
    "http://api.eventiapp.com.mx/",
    "http://192.168.1.10:18080/",
    "http://localhost.evil.com/",
    "not a url",
  ])("keeps production CSP in dev for non-loopback-http %s", (eventsUrl) => {
    expect(loopbackHttpOrigin(eventsUrl)).toBeNull();
    expect(buildContentSecurityPolicy({ dev: true, eventsUrl })).toBe(PINNED_PRODUCTION_CSP);
  });
});
