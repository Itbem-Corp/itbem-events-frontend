// @ts-check
import { defineConfig, envField } from 'astro/config';
import react from '@astrojs/react';
import tailwind from '@astrojs/tailwind';
import cloudflare from '@astrojs/cloudflare';
import Critters from 'critters';
import AstroPWA from '@vite-pwa/astro';

// Static by default — pages with `export const prerender = false` opt into SSR.
// SSR pages (e.g. /e/[identifier], /rsvp/[identifier], /evento) run on
// Cloudflare Pages Functions for dynamic OG tags.
// All interactivity is handled by client:only React islands that call
// PUBLIC_EVENTS_URL (the Go backend) directly from the browser.
export default defineConfig({
  output: 'server',
  adapter: cloudflare(),

  site: 'https://www.eventiapp.com.mx',

  integrations: [
    react(),
    tailwind(),

    // ── PWA ──────────────────────────────────────────────────────────────────
    // Generates service worker (Workbox) + injects manifest link into <head>.
    // SW is output to dist/sw.js — served as a static Cloudflare Pages asset.
    AstroPWA({
      registerType: 'autoUpdate',
      // 'auto' injects the workbox-window registration snippet into every page.
      injectRegister: 'auto',

      manifest: {
        name: 'EventiApp',
        short_name: 'EventiApp',
        description: 'Tu invitación digital',
        theme_color: '#dd2284',
        background_color: '#07293A',
        display: 'standalone',
        orientation: 'portrait-primary',
        start_url: '/',
        lang: 'es-MX',
        icons: [
          { src: '/icons/pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/pwa-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: '/icons/pwa-512-maskable.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },

      workbox: {
        // Precache: static assets only (JS/CSS chunks, fonts, icons, SVGs).
        // Do NOT include *.html here — pages are SSR and handled by runtime cache.
        globPatterns: ['**/*.{js,css,svg,png,ico,woff,woff2,otf,ttf,webmanifest}'],

        // Offline fallback for navigations that fail (network down, no cache).
        // /offline is statically prerendered (prerender = true in offline.astro).
        navigateFallback: '/offline',

        // Don't intercept: API routes — these must always go to network or SW cache.
        navigateFallbackDenylist: [/^\/api\//, /^\/cdn-cgi\//],

        runtimeCaching: [
          // ── SSR event pages (NetworkFirst + cache) ──────────────────────────
          // Caches the HTML shell of /e/[identifier] and /rsvp/[identifier].
          // On subsequent offline visits: SW serves cached HTML → React loads →
          // reads SW-cached API response → invitation renders fully offline.
          {
            urlPattern: ({ request, url }) =>
              request.mode === 'navigate' &&
              (url.pathname.startsWith('/e/') || url.pathname.startsWith('/rsvp/')),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'event-pages',
              networkTimeoutSeconds: 4,
              expiration: {
                maxEntries: 30,
                maxAgeSeconds: 7 * 24 * 60 * 60, // 7 days
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },

          // ── API responses (StaleWhileRevalidate) ────────────────────────────
          // Serves cached data instantly while updating in background.
          // Covers: page-spec, sections, moments wall.
          {
            urlPattern: ({ url }) =>
              url.hostname === 'api.eventiapp.com.mx' ||
              (url.hostname === 'localhost' && url.port === '8080'),
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'api-cache',
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
          {
            urlPattern: ({ url }) =>
              url.hostname.includes('amazonaws.com') &&
              !/\.(mp4|webm|mov|m4v|3gp)(\?|$)/i.test(url.pathname + url.search),
            handler: 'CacheFirst',
            options: {
              cacheName: 's3-images',
              expiration: {
                maxEntries: 200,
                maxAgeSeconds: 7 * 24 * 60 * 60, // 7 days
              },
              cacheableResponse: { statuses: [0, 200] },
              // Enables caching of partial responses (important for presigned S3 URLs).
              rangeRequests: true,
            },
          },

          // ── Google Fonts / Maps (NetworkFirst) ─────────────────────────────
          {
            urlPattern: ({ url }) =>
              url.hostname.includes('google') || url.hostname.includes('googleapis'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'google-cache',
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
      PUBLIC_EVENTS_URL: envField.string({ context: 'client', access: 'public' }),
    },
  },

  vite: {
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
        name: 'vite-plugin-critters',
        enforce: 'post',
        apply: 'build',
        async generateBundle(_, bundle) {
          const critters = new Critters({ preload: 'swap' });
          for (const file of Object.keys(bundle)) {
            const chunk = bundle[file];
            if (chunk.type === 'asset' && chunk.fileName.endsWith('.html')) {
              chunk.source = await critters.process(chunk.source);
            }
          }
        },
      },
    ],
  },
});
