// @ts-check
import { defineConfig, envField } from "astro/config";
import react from "@astrojs/react";
import cloudflare from "@astrojs/cloudflare";
import tailwindcss from "@tailwindcss/vite";
import Beasties from "beasties";
import { loadEnv } from "vite";
import publicProduct from "./src/generated/public-product.json" with { type: "json" };
import AstroPWA from "./scripts/vite-pwa-astro.mjs";
import {
  buildServiceWorkerCachePolicyScript,
  SW_CACHE_POLICY_SCRIPT,
} from "./scripts/sw-cache-policy.mjs";
import {
  createApiRuntimeCacheMatcher,
  createFreshFirstApiMatcher,
  createPublicEventPageRuntimeCacheMatcher,
  createS3ImageRuntimeCacheMatcher,
  createServerCachePolicyPlugin,
} from "./src/lib/apiCachePolicy.mjs";

// Same resolution as the client's import.meta.env (process.env first, then
// .env.[mode].local, .env.[mode], .env.local, .env), so the service worker's
// cache policy recognises the exact API origin the islands call.
const ENV_MODE = process.env.NODE_ENV === "development" ? "development" : "production";
const PUBLIC_ENV = loadEnv(ENV_MODE, process.cwd(), "PUBLIC_");
const EVENTS_API_URL =
  PUBLIC_ENV.PUBLIC_EVENTS_URL || `https://${publicProduct.apiHostname}`;
const PUBLIC_SITE_URL = `https://${publicProduct.canonicalHostname}`;
// Revision for the precached /offline fallback: changes on every build.
const OFFLINE_PAGE_REVISION = String(Date.now());
const OFFLINE_FALLBACK_URL = "/offline/";
const requestedPublicDevPort = Number.parseInt(
  process.env.EVENTIAPP_PUBLIC_PORT ?? "4321",
  10,
);
const PUBLIC_DEV_PORT =
  Number.isSafeInteger(requestedPublicDevPort) && requestedPublicDevPort > 0
    ? requestedPublicDevPort
    : 4321;

// Static by default — pages with `export const prerender = false` opt into SSR.
// SSR pages (e.g. /e/[identifier], /rsvp/[identifier], /evento) run on
// Cloudflare Worker SSR renders dynamic OG tags.
// All interactivity is handled by client:only React islands that call
// PUBLIC_EVENTS_URL (the Go backend) directly from the browser.
export default defineConfig({
  output: "server",
  // Event media already arrives in display-ready variants from the backend/CDN.
  // Avoid shipping Astro's Sharp endpoint to Workers, where native Sharp cannot run.
  adapter: cloudflare({ imageService: "passthrough" }),

  site: PUBLIC_SITE_URL,

  integrations: [
    react(),
    // ── PWA ──────────────────────────────────────────────────────────────────
    // Generates service worker (Workbox) + injects manifest link into <head>.
    // SW is output to dist/sw.js — served as a static Cloudflare Worker asset.
    AstroPWA({
      registerType: "autoUpdate",
      // 'auto' injects the workbox-window registration snippet into every page.
      injectRegister: "auto",

      manifest: {
        name: publicProduct.branding.name,
        short_name: publicProduct.branding.shortName,
        description: publicProduct.branding.description,
        theme_color: publicProduct.branding.themeColor,
        background_color: publicProduct.branding.backgroundColor,
        display: "standalone",
        orientation: "portrait-primary",
        start_url: "/",
        lang: publicProduct.branding.locale,
        icons: [
          { src: "/icons/pwa-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icons/pwa-512.png", sizes: "512x512", type: "image/png" },
          {
            src: "/icons/pwa-512-maskable.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },

      workbox: {
        // Precache: static assets only (JS/CSS chunks, fonts, icons, SVGs).
        // Do NOT include *.html here — pages are SSR and handled by runtime cache.
        globPatterns: [
          "**/*.{js,css,svg,png,ico,woff,woff2,otf,ttf,webmanifest}",
        ],
        // Upload transport is useless offline (API + S3 are mandatory). Keep its
        // intent-loaded chunk out of install-time precache so the async boundary
        // also saves network bytes, not only parse/evaluation work.
        globIgnores: [
          "**/SharedUploadEngine.*.js",
          // Optional typefaces are fetched on demand after their first use;
          // do not make a first PWA install download every template font.
          "**/fonts/Aloevera-*.woff2",
          "**/fonts/Astralaga SemiBold.woff2",
        ],

        // Offline fallback: /offline/ (prerendered in offline.astro) is served
        // only when a navigation FAILS — never as an app shell. `navigateFallback`
        // would answer every navigation with it, which is wrong for SSR pages.
        // HTML is not in globPatterns, so precache it explicitly (new revision
        // per build). Its canonical URL is "/offline/": "/offline" answers a 307,
        // and a redirect during install fails the whole service worker.
        additionalManifestEntries: [
          { url: OFFLINE_FALLBACK_URL, revision: OFFLINE_PAGE_REVISION },
        ],
        // The runtimeCaching matchers below call helpers from apiCachePolicy.mjs;
        // load them into the worker before its routes are registered.
        importScripts: [`/${SW_CACHE_POLICY_SCRIPT}`],
        // vite-plugin-pwa defaults this to "index.html" (an SPA shell); null
        // turns that NavigationRoute off so SSR pages always reach the network.
        navigateFallback: null,

        runtimeCaching: [
          // ── SSR event pages (NetworkFirst + cache) ──────────────────────────
          // Caches the HTML shell of /e/[identifier] and /rsvp/[identifier].
          // On subsequent offline visits: SW serves cached HTML → React loads →
          // reads SW-cached API response → invitation renders fully offline.
          {
            urlPattern: createPublicEventPageRuntimeCacheMatcher(),
            handler: "NetworkFirst",
            options: {
              cacheName: "event-pages",
              networkTimeoutSeconds: 4,
              expiration: {
                maxEntries: 30,
                maxAgeSeconds: 7 * 24 * 60 * 60, // 7 days
              },
              cacheableResponse: { statuses: [0, 200] },
              // Cache-Control no-store/private from the server is never cached.
              plugins: [createServerCachePolicyPlugin()],
              // Offline and never opened on this device: show /offline/.
              precacheFallback: { fallbackURL: OFFLINE_FALLBACK_URL },
            },
          },

          // ── Any other page navigation (network only) ───────────────────────
          // Pages are SSR and are not cached; when the network fails, show the
          // precached offline page instead of the browser's error.
          {
            urlPattern: (/** @type {{ request: Request, url: URL }} */ { request, url }) =>
              request.mode === "navigate" &&
              url.origin === self.location.origin &&
              !url.pathname.startsWith("/api/") &&
              !url.pathname.startsWith("/cdn-cgi/"),
            handler: "NetworkOnly",
            options: {
              precacheFallback: { fallbackURL: OFFLINE_FALLBACK_URL },
            },
          },

          // Optional local fonts are immutable assets. Cache after first use,
          // rather than making them part of the install-time download.
          {
            urlPattern: (/** @type {{ url: URL }} */ { url }) =>
              url.origin === self.location.origin &&
              url.pathname.startsWith("/fonts/"),
            handler: "CacheFirst",
            options: {
              cacheName: "eventi-template-fonts",
              expiration: {
                maxEntries: 8,
                maxAgeSeconds: 365 * 24 * 60 * 60,
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },

          // ── Mutable API responses (NetworkFirst) ────────────────────────────
          // PageSpec, MomentWall, QR upload status, invitation data, and section
          // resources must reflect recent dashboard/backend changes while still
          // having a short offline fallback.
          {
            urlPattern: createFreshFirstApiMatcher(EVENTS_API_URL),
            handler: "NetworkFirst",
            options: {
              cacheName: "api-fresh",
              networkTimeoutSeconds: 3,
              expiration: {
                maxEntries: 80,
                maxAgeSeconds: 60 * 60, // 1 hour offline fallback
              },
              cacheableResponse: { statuses: [0, 200] },
              // Cache-Control no-store/private from the server is never cached.
              plugins: [createServerCachePolicyPlugin()],
            },
          },

          // ── Other API responses (StaleWhileRevalidate) ──────────────────────
          // Serves non-critical cached data instantly while updating in background.
          {
            urlPattern: createApiRuntimeCacheMatcher(EVENTS_API_URL),
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "api-cache",
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 24 * 60 * 60, // 24 hours
              },
              cacheableResponse: { statuses: [0, 200] },
              // Cache-Control no-store/private from the server is never cached.
              plugins: [createServerCachePolicyPlugin()],
            },
          },

          // ── S3 images and thumbnails (CacheFirst) ──────────────────────────
          // Photos don't change once uploaded. Cache aggressively.
          // Videos are excluded (too large for device storage).
          // Signed S3 URLs are excluded so cached responses cannot outlive
          // the backend-issued URL expiration.
          {
            urlPattern: createS3ImageRuntimeCacheMatcher(),
            handler: "CacheFirst",
            options: {
              cacheName: "s3-images",
              expiration: {
                maxEntries: 200,
                maxAgeSeconds: 7 * 24 * 60 * 60, // 7 days
              },
              cacheableResponse: { statuses: [0, 200] },
              // Enables caching of partial image responses when the browser requests them.
              rangeRequests: true,
            },
          },

          // ── Google Fonts / Maps (NetworkFirst) ─────────────────────────────
          {
            urlPattern: (/** @type {{ url: URL }} */ { url }) =>
              url.hostname.includes("google") ||
              url.hostname.includes("googleapis"),
            handler: "NetworkFirst",
            options: {
              cacheName: "google-cache",
              networkTimeoutSeconds: 3,
              expiration: { maxEntries: 20, maxAgeSeconds: 24 * 60 * 60 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },

      // Disable SW in dev — prevents confusing stale-cache issues during development.
      devOptions: {
        enabled: false,
      },
    }),
  ],

  env: {
    schema: {
      // Backend API URL injected at build time — available to client-side code.
      // Local: http://localhost:8080  |  Production: https://api.eventiapp.com.mx
      PUBLIC_EVENTS_URL: envField.string({
        context: "client",
        access: "public",
      }),
      // Optional dashboard base URL for branded /api/og images.
      PUBLIC_DASHBOARD_URL: envField.string({
        context: "client",
        access: "public",
        optional: true,
      }),
    },
  },

  vite: {
    server: {
      // Astro serves the local app on 4321, while Vite otherwise advertises its
      // own 5173 default to the browser. Pin the client socket to the canonical
      // EventiApp port so HMR remains connected in the local ecosystem.
      hmr: { clientPort: PUBLIC_DEV_PORT },
    },
    build: {
      rollupOptions: {
        output: {
          // Required for Beasties (critical CSS inlining) to work correctly.
          manualChunks: undefined,
        },
      },
    },
    plugins: [
      tailwindcss(),
      {
        // Emits the service worker's cache-policy helpers (see
        // scripts/sw-cache-policy.mjs) next to sw.js in the client build.
        name: "eventiapp:sw-cache-policy",
        apply: "build",
        applyToEnvironment(/** @type {{ name: string }} */ environment) {
          return environment.name === "client";
        },
        generateBundle() {
          this.emitFile({
            type: "asset",
            fileName: SW_CACHE_POLICY_SCRIPT,
            source: buildServiceWorkerCachePolicyScript(EVENTS_API_URL),
          });
        },
      },
      {
        name: "vite-plugin-beasties",
        enforce: "post",
        apply: "build",
        /**
         * @param {import('rolldown').NormalizedOutputOptions} _
         * @param {import('rolldown').OutputBundle} bundle
         * @param {boolean} _isWrite
         */
        async generateBundle(_, bundle, _isWrite) {
          const beasties = new Beasties({ preload: "swap" });
          for (const file of Object.keys(bundle)) {
            const chunk = bundle[file];
            if (
              chunk.type === "asset" &&
              chunk.fileName.endsWith(".html") &&
              typeof chunk.source === "string"
            ) {
              chunk.source = await beasties.process(chunk.source);
            }
          }
        },
      },
    ],
  },
});
