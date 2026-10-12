import { describe, expect, it, vi } from "vitest";

import {
  buildContentSecurityPolicy,
  isStudioPreviewRequest,
  PRODUCTION_CSP,
  studioPreviewFrameAncestors,
  withFrameAncestors,
} from "../../src/lib/contentSecurityPolicy";

vi.mock("astro:middleware", () => ({
  defineMiddleware: (handler: unknown) => handler,
}));

type Handler = (
  context: { url: URL },
  next: () => Promise<Response>,
) => Promise<Response>;

async function headersFor(path: string): Promise<Headers> {
  const { onRequest } = (await import("../../src/middleware")) as unknown as {
    onRequest: Handler;
  };
  const response = await onRequest(
    { url: new URL(path, "https://www.eventiapp.com.mx") },
    async () => new Response("<html></html>"),
  );
  return response.headers;
}

function frameAncestors(csp: string | null): string {
  return (csp ?? "").split("; ").find((d) => d.startsWith("frame-ancestors")) ?? "";
}

// STU-5, STU-69, EVT-45: the Studio preview iframe was blank because every
// route answered X-Frame-Options: DENY and frame-ancestors 'none'.
describe("Studio preview framing", () => {
  it("recognises only event pages that carry a preview token", () => {
    const yes = [
      "/e/boda?preview=1&t=3&preview_token=abc",
      "/e/boda/?previewToken=abc",
      "/rsvp/boda?preview_token=abc",
    ];
    const no = [
      "/e/boda",
      "/e/boda?preview=1",
      "/e/boda?preview_token=",
      "/e/boda?token=abc",
      "/e/boda/momentos?preview_token=abc",
      "/events/boda/upload?preview_token=abc",
      "/?preview_token=abc",
    ];
    for (const path of yes) {
      expect(isStudioPreviewRequest(new URL(path, "https://x.test"))).toBe(true);
    }
    for (const path of no) {
      expect(isStudioPreviewRequest(new URL(path, "https://x.test"))).toBe(false);
    }
  });

  it("allows the production dashboard host, and loopback dashboards only in dev", () => {
    expect(
      studioPreviewFrameAncestors({ dev: false, dashboardHostname: "dashboard.eventiapp.com.mx" }),
    ).toEqual(["https://dashboard.eventiapp.com.mx"]);
    expect(
      studioPreviewFrameAncestors({ dev: true, dashboardHostname: "dashboard.eventiapp.com.mx" }),
    ).toEqual([
      "https://dashboard.eventiapp.com.mx",
      "http://localhost:*",
      "http://*.localhost:*",
      "http://127.0.0.1:*",
    ]);
    expect(
      studioPreviewFrameAncestors({ dev: false, dashboardHostname: "evil.com; script-src *" }),
    ).toEqual([]);
  });

  it("only swaps frame-ancestors in the production policy", () => {
    const policy = withFrameAncestors(
      buildContentSecurityPolicy({ dev: false }),
      ["https://dashboard.eventiapp.com.mx"],
    );
    expect(frameAncestors(policy)).toBe("frame-ancestors https://dashboard.eventiapp.com.mx");
    expect(policy.replace("frame-ancestors https://dashboard.eventiapp.com.mx", "frame-ancestors 'none'")).toBe(
      PRODUCTION_CSP,
    );
    expect(withFrameAncestors(PRODUCTION_CSP, [])).toBe(PRODUCTION_CSP);
  });

  it("the middleware lets the dashboard frame the preview route", async () => {
    const headers = await headersFor("/e/boda?preview=1&t=2&preview_token=abc");
    expect(headers.has("x-frame-options")).toBe(false);
    const ancestors = frameAncestors(headers.get("content-security-policy"));
    expect(ancestors).toContain("https://dashboard.eventiapp.com.mx");
    expect(ancestors).not.toContain("'none'");
    expect(ancestors).not.toMatch(/\s\*(\s|$)|https:(\s|$)/);
  });

  it.each([
    "/",
    "/e/boda",
    "/e/boda?token=abc",
    "/e/boda/momentos?preview_token=abc",
    "/rsvp/boda",
    "/events/boda/upload",
    "/offline",
  ])("every other route stays unframeable: %s", async (path) => {
    const headers = await headersFor(path);
    expect(headers.get("x-frame-options")).toBe("DENY");
    expect(frameAncestors(headers.get("content-security-policy"))).toBe("frame-ancestors 'none'");
  });
});
