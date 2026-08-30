import { afterEach, describe, expect, it, vi } from "vitest";

import bridge from "../cloudflare-pages-bridge/_worker.js";

const workerOrigin = "https://eventiapp-public.andresbme.workers.dev";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Cloudflare Pages Worker bridge", () => {
  it("forwards the full path and rewrites public HTML URLs", async () => {
    const upstreamFetch = vi.fn(async (request) => {
      expect(request.url).toBe(`${workerOrigin}/e/demo?utm_source=smoke`);
      expect(request.headers.get("x-forwarded-host")).toBe("www.eventiapp.com.mx");
      expect(request.headers.get("x-forwarded-proto")).toBe("https");

      return new Response(`<meta property="og:url" content="${workerOrigin}/e/demo?utm_source=smoke">`, {
        headers: {
          "content-encoding": "gzip",
          "content-length": "999",
          "content-type": "text/html; charset=utf-8",
        },
      });
    });
    vi.stubGlobal("fetch", upstreamFetch);

    const response = await bridge.fetch(
      new Request("https://www.eventiapp.com.mx/e/demo?utm_source=smoke"),
    );

    expect(await response.text()).toContain(
      "https://www.eventiapp.com.mx/e/demo?utm_source=smoke",
    );
    expect(response.headers.has("content-encoding")).toBe(false);
    expect(response.headers.has("content-length")).toBe(false);
  });

  it("rewrites same-origin Worker redirects to the public hostname", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(null, {
          status: 302,
          headers: { location: `${workerOrigin}/offline/` },
        }),
      ),
    );

    const response = await bridge.fetch(new Request("https://www.eventiapp.com.mx/offline"));

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("https://www.eventiapp.com.mx/offline/");
  });
});
