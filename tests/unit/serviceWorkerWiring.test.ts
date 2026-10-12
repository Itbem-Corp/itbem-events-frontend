import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { describe, expect, it } from "vitest";

import {
  createApiRuntimeCacheMatcher,
  createFreshFirstApiMatcher,
  createPublicEventPageRuntimeCacheMatcher,
  createS3ImageRuntimeCacheMatcher,
  createServerCachePolicyPlugin,
} from "../../src/lib/apiCachePolicy.mjs";
import {
  buildServiceWorkerCachePolicyScript,
  SW_CACHE_POLICY_SCRIPT,
} from "../../scripts/sw-cache-policy.mjs";

const read = (path: string) =>
  readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8");

// PUB-103: the manifest was never linked and the service worker never
// registered. Once registered, the worker must also be able to run its
// matchers: Workbox stringifies them, losing the helpers they call.
describe("service worker cache-policy helpers", () => {
  const script = buildServiceWorkerCachePolicyScript("https://api.eventiapp.com.mx");

  function inWorker<T>(matcherSource: string, input: Record<string, unknown>): T {
    const context = vm.createContext({ URL, self: { location: { origin: "https://www.eventiapp.com.mx" } } });
    vm.runInContext(script, context);
    context.__input = input;
    return vm.runInContext(`(${matcherSource})(__input)`, context) as T;
  }

  it("lets every stringified matcher run inside the worker", () => {
    const api = new URL("https://api.eventiapp.com.mx/api/events/boda/meta");
    const page = new URL("https://www.eventiapp.com.mx/e/boda");
    const s3 = new URL("https://bucket.s3.us-east-2.amazonaws.com/a.jpg");
    expect(inWorker(createFreshFirstApiMatcher("x").toString(), { url: api, request: { method: "GET" } })).toBe(true);
    expect(
      inWorker(createApiRuntimeCacheMatcher("x").toString(), {
        url: new URL("https://api.eventiapp.com.mx/api/designs"),
        request: { method: "GET" },
      }),
    ).toBe(true);
    expect(
      inWorker(createPublicEventPageRuntimeCacheMatcher().toString(), {
        url: page,
        request: { mode: "navigate" },
      }),
    ).toBe(true);
    expect(inWorker(createS3ImageRuntimeCacheMatcher().toString(), { url: s3 })).toBe(true);
  });

  it("keeps credential-bearing pages and API calls out of the worker caches", () => {
    expect(
      inWorker(createPublicEventPageRuntimeCacheMatcher().toString(), {
        url: new URL("https://www.eventiapp.com.mx/e/boda?token=abc"),
        request: { mode: "navigate" },
      }),
    ).toBe(false);
    expect(
      inWorker(createApiRuntimeCacheMatcher("x").toString(), {
        url: new URL("https://api.eventiapp.com.mx/api/events/boda/page-spec"),
        request: { method: "GET" },
      }),
    ).toBe(false);
  });
});

describe("service worker server cache policy plugin", () => {
  const script = buildServiceWorkerCachePolicyScript("https://api.eventiapp.com.mx");

  it("runs its stringified cacheWillUpdate inside the worker", async () => {
    const context = vm.createContext({ URL, Response, self: {} });
    vm.runInContext(script, context);
    const source = createServerCachePolicyPlugin().cacheWillUpdate.toString();
    context.__fn = vm.runInContext(`(${source})`, context);
    const privateResponse = new Response("x", { headers: { "Cache-Control": "private, no-store" } });
    const publicResponse = new Response("x", { headers: { "Cache-Control": "public, max-age=60" } });
    expect(await context.__fn({ response: privateResponse })).toBeNull();
    expect(await context.__fn({ response: publicResponse })).toBe(publicResponse);
  });

  it("is attached to every runtime cache that stores pages or API data", () => {
    const config = read("../../astro.config.mjs");
    for (const cacheName of ["event-pages", "api-fresh", "api-cache"]) {
      const block = config.slice(config.indexOf(`cacheName: "${cacheName}"`));
      const end = block.indexOf("urlPattern:");
      expect(block.slice(0, end), cacheName).toContain("plugins: [createServerCachePolicyPlugin()]");
    }
  });

  it("reads the API URL with Vite's loadEnv, like the client", () => {
    const config = read("../../astro.config.mjs");
    expect(config).toContain('import { loadEnv } from "vite";');
    expect(config).toMatch(/PUBLIC_ENV\.PUBLIC_EVENTS_URL \|\|/);
    expect(config).not.toContain("process.env.PUBLIC_EVENTS_URL");
  });
});

describe("PWA wiring", () => {
  it("every page links the manifest and registers the worker in production", () => {
    const layout = read("../../src/layouts/template.astro");
    expect(layout).toContain('<link rel="manifest" href="/manifest.webmanifest" />');
    expect(layout).toMatch(/serviceWorkerEnabled && <script is:inline defer src="\/registerSW\.js"><\/script>/);
    expect(layout).toContain("const serviceWorkerEnabled = import.meta.env.PROD;");
  });

  it("serves /offline/ only when a navigation fails, never as an app shell", () => {
    const config = read("../../astro.config.mjs");
    expect(config).toContain("navigateFallback: null");
    expect(config).toContain('const OFFLINE_FALLBACK_URL = "/offline/";');
    expect(config).toContain("{ url: OFFLINE_FALLBACK_URL, revision: OFFLINE_PAGE_REVISION }");
    expect(config.match(/precacheFallback: \{ fallbackURL: OFFLINE_FALLBACK_URL \}/g)).toHaveLength(2);
    expect(config).toContain("importScripts: [`/${SW_CACHE_POLICY_SCRIPT}`]");
  });

  // Review F6: the worker and the helper it imports must always revalidate, so
  // a new sw.js never pairs with an HTTP-cached policy script.
  it("pins Cache-Control: no-cache for sw.js and sw-cache-policy.js", () => {
    const headers = read("../../public/_headers").replace(/\r\n/g, "\n");
    for (const path of ["/sw.js", `/${SW_CACHE_POLICY_SCRIPT}`]) {
      const block = headers.split(/\n(?=\S)/).find((rule) => rule.split("\n")[0].trim() === path);
      expect(block, path).toBeDefined();
      expect(block, path).toMatch(/^\s+Cache-Control: no-cache\s*$/m);
    }
  });

  it("has a Spanish 404 page on the site layout (viewport included)", () => {
    const page = read("../../src/pages/404.astro");
    expect(page).toContain("import TemplateLayout from '../layouts/template.astro';");
    expect(page).toContain("No encontramos esta página");
    expect(read("../../src/layouts/template.astro")).toContain('name="viewport"');
    // Review F7: the product name comes from the contract, not a literal.
    expect(page).toContain("const productName = PUBLIC_PRODUCT.branding.name;");
    expect(page).not.toMatch(/EventiApp/);
  });
});
