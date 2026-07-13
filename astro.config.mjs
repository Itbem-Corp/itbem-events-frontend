// @ts-check
import { defineConfig, envField } from "astro/config";
import react from "@astrojs/react";
import tailwind from "@astrojs/tailwind";
import cloudflare from "@astrojs/cloudflare";
import Critters from "critters";
import AstroPWA from "@vite-pwa/astro";
import {
  createApiRuntimeCacheMatcher,
  createFreshFirstApiMatcher,
  createPublicEventPageRuntimeCacheMatcher,
  createS3ImageRuntimeCacheMatcher,
} from "./src/lib/apiCachePolicy.mjs";

const EVENTS_API_URL = process.env.PUBLIC_EVENTS_URL;
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
// Cloudflare Pages Functions for dynamic OG tags.
// All interactivity is handled by client:only React islands that call
// PUBLIC_EVENTS_URL (the Go backend) directly from the browser.
export default defineConfig({
  output: "server",
  // Event media already arrives in display-ready variants from the backend/CDN.
  // Avoid shipping Astro's Sharp endpoint to Workers, where native Sharp cannot run.
  adapter: cloudflare({ imageService: "passthrough" }),

  site: "https://www.eventiapp.com.mx",

  integrations: [
    react(),
    tailwind(),

    // ── PWA ──────────────────────────────────────────────────────────────────
    // Generates service worker (Workbox) + injects manifest link into <head>.
    // SW is output to dist/sw.js — served as a static Cloudflare Pages asset.
    AstroPWA({
      registerType: "autoUpdate",
      // 'auto' injects the workbox-window registration snippet into every page.
      injectRegister: "auto",

      manifest: {
        name: "EventiApp",
        short_name: "EventiApp",
        description: "Tu invitación digital",
        theme_color: "#dd2284",
        background_color: "#07293A",
        display: "standalone",
        orientation: "portrait-primary",
        start_url: "/",
        lang: "es-MX",
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
        globIgnores: ["**/SharedUploadEngine.*.js"],

        // Offline fallback for navigations that fail (network down, no cache).
        // /offline is statically prerendered (prerender = true in offline.astro).
        navigateFallback: "/offline",

        // Don't intercept: API routes — these must always go to network or SW cache.
        navigateFallbackDenylist: [/^\/api\//, /^\/cdn-cgi\//],

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
            urlPattern: ({ url }) =>
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
          // Required for Critters (critical CSS inlining) to work correctly.
          manualChunks: undefined,
        },
      },
    },
    plugins: [
      {
        name: "vite-plugin-critters",
        enforce: "post",
        apply: "build",
        /**
         * @param {unknown} _
         * @param {import('rollup').OutputBundle} bundle
         */
        async generateBundle(_, bundle) {
          const critters = new Critters({ preload: "swap" });
          for (const file of Object.keys(bundle)) {
            const chunk = bundle[file];
            if (
              chunk.type === "asset" &&
              chunk.fileName.endsWith(".html") &&
              typeof chunk.source === "string"
            ) {
              chunk.source = await critters.process(chunk.source);
            }
          }
        },
      },
    ],
  },
});
