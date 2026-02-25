# EventiApp PWA Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Turn eventiapp into a top-tier installable PWA with full offline support, smart install prompt, and Workbox-powered multi-layer caching.

**Architecture:** `@vite-pwa/astro` (Workbox) generates the service worker at build time. SW uses a 4-layer cache strategy: precache for app shell, NetworkFirst+cache for SSR event HTML pages (enabling true offline invitation viewing), StaleWhileRevalidate for API responses, CacheFirst for S3 images. Smart `InstallPrompt` React component handles Android (`beforeinstallprompt`) and iOS (manual instructions) separately, with 7-day dismiss cooldown and standalone-mode detection.

**Tech Stack:** `@vite-pwa/astro` 0.5+, Workbox 7, `sharp` (icon generation, dev-only), Framer Motion (already installed), React 19, Astro 5 + Cloudflare adapter.

---

## Context for the implementer

- **Project root:** `C:\Users\AndBe\Desktop\Projects\cafetton-casero` (Windows) or `/var/www/cafetton-casero` (WSL)
- **Run commands from:** `C:\Users\AndBe\Desktop\Projects\cafetton-casero` using `npm run ...`
- **Key files:**
  - `astro.config.mjs` — Astro + Vite config, integrations go here
  - `src/layouts/template.astro` — the single HTML layout used by all pages
  - `src/components/engine/EventPage.tsx` — root React island for event invitation pages (lines 354–378 are the return statement)
  - `src/components/ShareWidget.tsx` — example React component for style reference
  - `public/favicon.svg` — eventiapp SVG logo (pink `#dd2284` circle with white "e")
  - `public/_redirects` — Cloudflare redirects (don't modify)
  - `scripts/fix-routes.mjs` — post-build script (already exists, don't modify)
- **No test framework** — project uses Playwright e2e only. Unit tests are not needed for PWA plumbing. Verify by running `npm run build` and inspecting output.
- **Deployment:** Cloudflare Pages. SW is served as a static file — no special Cloudflare config needed.
- **Icons:** Generate locally with sharp, commit the PNG files. Do NOT add icon generation to the build script (avoid sharp in CI).

---

## Task 1: Install dependencies

**Files:**
- Modify: `package.json`

**Step 1: Install @vite-pwa/astro and sharp**

```bash
cd "C:\Users\AndBe\Desktop\Projects\cafetton-casero"
npm install @vite-pwa/astro
npm install --save-dev sharp
```

**Step 2: Verify installation**

```bash
node -e "import('@vite-pwa/astro').then(m => console.log('ok', Object.keys(m)))"
```

Expected: `ok [ 'default', ... ]`

**Step 3: Commit**

```bash
cd "C:\Users\AndBe\Desktop\Projects\cafetton-casero"
git add package.json package-lock.json
git commit -m "chore(pwa): install @vite-pwa/astro and sharp"
```

---

## Task 2: Generate PWA icons

**Files:**
- Create: `scripts/generate-pwa-icons.mjs`
- Create: `public/icons/pwa-192.png` (generated)
- Create: `public/icons/pwa-512.png` (generated)
- Create: `public/icons/pwa-512-maskable.png` (generated)

**Step 1: Create the icon generation script**

Create `scripts/generate-pwa-icons.mjs` with this exact content:

```js
/**
 * Generates PWA icons from public/favicon.svg using sharp.
 * Run once locally and commit the output — do not add to CI build.
 *
 * Usage: node scripts/generate-pwa-icons.mjs
 */
import sharp from 'sharp';
import { readFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const svgPath = join(__dirname, '../public/favicon.svg');
const outDir = join(__dirname, '../public/icons');

mkdirSync(outDir, { recursive: true });

const svgBuffer = readFileSync(svgPath);

// pink background color for the icon: #dd2284 = rgb(221, 34, 132)
const bg = { r: 221, g: 34, b: 132, alpha: 1 };

// 192×192 — standard Android home screen icon
await sharp({
  create: { width: 192, height: 192, channels: 4, background: bg },
})
  .composite([{
    input: await sharp(svgBuffer, { density: 300 })
      .resize(140, 140, { fit: 'contain', background: { ...bg } })
      .png()
      .toBuffer(),
    gravity: 'center',
  }])
  .png()
  .toFile(join(outDir, 'pwa-192.png'));

console.log('✅ pwa-192.png');

// 512×512 — standard high-res icon
await sharp({
  create: { width: 512, height: 512, channels: 4, background: bg },
})
  .composite([{
    input: await sharp(svgBuffer, { density: 300 })
      .resize(370, 370, { fit: 'contain', background: { ...bg } })
      .png()
      .toBuffer(),
    gravity: 'center',
  }])
  .png()
  .toFile(join(outDir, 'pwa-512.png'));

console.log('✅ pwa-512.png');

// 512×512 maskable — logo occupies 60% (safe zone), padded with solid background.
// Android adaptive icons crop to a circle/squircle — the safe zone keeps the logo visible.
const logoSize = Math.round(512 * 0.6); // 307px
await sharp({
  create: { width: 512, height: 512, channels: 4, background: bg },
})
  .composite([{
    input: await sharp(svgBuffer, { density: 300 })
      .resize(logoSize, logoSize, { fit: 'contain', background: { ...bg } })
      .png()
      .toBuffer(),
    gravity: 'center',
  }])
  .png()
  .toFile(join(outDir, 'pwa-512-maskable.png'));

console.log('✅ pwa-512-maskable.png');
console.log('🎉 All PWA icons generated in public/icons/');
```

**Step 2: Run the script**

```bash
cd "C:\Users\AndBe\Desktop\Projects\cafetton-casero"
node scripts/generate-pwa-icons.mjs
```

Expected output:
```
✅ pwa-192.png
✅ pwa-512.png
✅ pwa-512-maskable.png
🎉 All PWA icons generated in public/icons/
```

Verify: `ls public/icons/` should show 3 PNG files.

**Step 3: Commit icons and script**

```bash
cd "C:\Users\AndBe\Desktop\Projects\cafetton-casero"
git add scripts/generate-pwa-icons.mjs public/icons/
git commit -m "feat(pwa): add icon generation script and generated PWA icons"
```

---

## Task 3: Create web app manifest

**Files:**
- Create: `public/manifest.webmanifest`

**Step 1: Create the manifest**

Create `public/manifest.webmanifest`:

```json
{
  "name": "EventiApp",
  "short_name": "EventiApp",
  "description": "Tu invitación digital",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#07293A",
  "theme_color": "#dd2284",
  "orientation": "portrait-primary",
  "lang": "es-MX",
  "categories": ["lifestyle", "social"],
  "icons": [
    {
      "src": "/icons/pwa-192.png",
      "sizes": "192x192",
      "type": "image/png"
    },
    {
      "src": "/icons/pwa-512.png",
      "sizes": "512x512",
      "type": "image/png"
    },
    {
      "src": "/icons/pwa-512-maskable.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "maskable"
    }
  ]
}
```

**Step 2: Verify JSON is valid**

```bash
cd "C:\Users\AndBe\Desktop\Projects\cafetton-casero"
node -e "JSON.parse(require('fs').readFileSync('public/manifest.webmanifest','utf8')); console.log('valid JSON')"
```

Expected: `valid JSON`

**Step 3: Commit**

```bash
git add public/manifest.webmanifest
git commit -m "feat(pwa): add web app manifest"
```

---

## Task 4: Configure @vite-pwa/astro with Workbox

**Files:**
- Modify: `astro.config.mjs`

**Step 1: Read the current file first** (already done by implementer)

**Step 2: Add the PWA integration**

The current `astro.config.mjs` imports `react`, `tailwind`, `cloudflare`, and `Critters`. Add `AstroPWA` from `@vite-pwa/astro`.

Replace the entire `astro.config.mjs` with:

```js
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
              url.hostname === 'localhost' && url.port === '8080',
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
```

**Step 3: Verify the build compiles without errors**

```bash
cd "C:\Users\AndBe\Desktop\Projects\cafetton-casero"
npm run build 2>&1 | tail -20
```

Expected: `dist/sw.js` and `dist/workbox-*.js` in the output. No errors.

**Step 4: Confirm SW and manifest are in dist**

```bash
ls dist/sw.js dist/manifest.webmanifest dist/icons/pwa-192.png
```

Expected: all 3 files present.

**Step 5: Commit**

```bash
git add astro.config.mjs
git commit -m "feat(pwa): configure @vite-pwa/astro with Workbox multi-layer caching"
```

---

## Task 5: Add theme-color meta and manifest link to layout

**Files:**
- Modify: `src/layouts/template.astro`

**Step 1: Add theme-color meta tag**

In `src/layouts/template.astro`, inside `<head>`, after the `<link rel="icon" ...>` line (line 26), add:

```html
    <meta name="theme-color" content="#dd2284" />
    <meta name="mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="default" />
    <meta name="apple-mobile-web-app-title" content="EventiApp" />
    <link rel="apple-touch-icon" href="/icons/pwa-192.png" />
```

Note: `@vite-pwa/astro` injects `<link rel="manifest">` automatically. The apple-specific tags are needed because iOS Safari ignores the W3C manifest for some properties.

**Step 2: Verify the layout compiles**

```bash
npm run build 2>&1 | grep -E "error|Error|warning" | head -10
```

Expected: no errors.

**Step 3: Commit**

```bash
git add src/layouts/template.astro
git commit -m "feat(pwa): add theme-color and apple PWA meta tags to layout"
```

---

## Task 6: Create offline fallback page

**Files:**
- Create: `src/pages/offline.astro`

**Step 1: Create the offline page**

Create `src/pages/offline.astro` with this exact content:

```astro
---
/**
 * Offline fallback page — served by the service worker when a navigation
 * request fails (no network + no cache). Statically prerendered so Workbox
 * can precache it.
 */
export const prerender = true;

import TemplateLayout from '../layouts/template.astro';
---

<TemplateLayout title="Sin conexión — EventiApp">
  <main
    class="min-h-screen flex flex-col items-center justify-center px-6 text-center"
    style="background: #07293A;"
  >
    <!-- Logo -->
    <div
      class="w-24 h-24 rounded-3xl flex items-center justify-center shadow-2xl mb-8"
      style="background: #dd2284;"
    >
      <img
        src="/favicon.svg"
        alt="EventiApp"
        class="w-14 h-14"
        loading="eager"
        decoding="sync"
      />
    </div>

    <!-- Heading -->
    <h1 class="text-3xl font-bold text-white mb-3">Sin conexión</h1>

    <!-- Body -->
    <p class="text-white/70 text-base max-w-xs leading-relaxed mb-8">
      Tu invitación está guardada.<br />
      Ábrela cuando vuelva la señal.
    </p>

    <!-- Retry button -->
    <button
      onclick="window.location.reload()"
      class="px-8 py-3.5 rounded-2xl text-white font-semibold text-sm shadow-lg transition-transform active:scale-95"
      style="background: #dd2284;"
      type="button"
    >
      Reintentar
    </button>

    <!-- Subtle version note -->
    <p class="mt-12 text-white/30 text-xs">EventiApp · Tu invitación digital</p>
  </main>
</TemplateLayout>
```

**Step 2: Build and verify the page is prerendered**

```bash
npm run build 2>&1 | grep offline
```

Expected: output contains `offline` (Astro logs the prerendered page).

Also check:
```bash
ls dist/offline/
```

Expected: `index.html` exists (or `dist/offline.html`).

**Step 3: Commit**

```bash
git add src/pages/offline.astro
git commit -m "feat(pwa): add offline fallback page (prerendered)"
```

---

## Task 7: Create InstallPrompt component

**Files:**
- Create: `src/components/InstallPrompt.tsx`

**Step 1: Create the component**

Create `src/components/InstallPrompt.tsx` with this exact content:

```tsx
'use client';

/**
 * Smart PWA install prompt.
 *
 * Android Chrome: intercepts `beforeinstallprompt`, shows custom banner after 3s.
 * iOS Safari:     detects iOS + non-standalone → shows "Add to Home Screen" instructions.
 * Already installed (standalone): renders nothing.
 * Dismissed: hidden for 7 days (localStorage).
 *
 * Only mounts inside EventPage (invitation pages) — never on root /
 * or other utility pages.
 */

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// BeforeInstallPromptEvent is not in standard TypeScript DOM lib yet.
interface BeforeInstallPromptEvent extends Event {
  readonly platforms: ReadonlyArray<string>;
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
  prompt(): Promise<void>;
}

const DISMISS_KEY = 'pwa-install-dismissed';
const COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// ── Platform detection helpers ─────────────────────────────────────────────

function detectPlatform(): 'android' | 'ios' | 'other' {
  if (typeof navigator === 'undefined') return 'other';
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua) && !(window as Window & { MSStream?: unknown }).MSStream) {
    return 'ios';
  }
  // Android Chrome (not Firefox/Samsung — those fire beforeinstallprompt anyway)
  return 'android';
}

function isInStandaloneMode(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isPreviewMode(): boolean {
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).get('preview') === '1';
}

function isDismissedRecently(): boolean {
  try {
    const ts = localStorage.getItem(DISMISS_KEY);
    if (!ts) return false;
    return Date.now() - Number(ts) < COOLDOWN_MS;
  } catch {
    return false;
  }
}

function markDismissed(): void {
  try {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
  } catch { /* storage unavailable — ignore */ }
}

// ── iOS instructions sub-component ────────────────────────────────────────

function IOSInstructions() {
  return (
    <div className="mt-4 rounded-2xl p-4 space-y-2.5" style={{ background: 'rgba(0,0,0,0.04)' }}>
      <p className="flex items-center gap-2.5 text-xs text-gray-600 leading-snug">
        <span className="text-lg select-none">1</span>
        <span>
          Toca el botón{' '}
          <span
            className="inline-flex items-center justify-center w-7 h-7 rounded-lg border border-gray-200 bg-white shadow-sm align-middle mx-0.5"
          >
            {/* iOS share icon */}
            <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="#007aff" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8" />
              <polyline points="16 6 12 2 8 6" />
              <line x1="12" y1="2" x2="12" y2="15" />
            </svg>
          </span>{' '}
          en Safari
        </span>
      </p>
      <p className="flex items-center gap-2.5 text-xs text-gray-600 leading-snug">
        <span className="text-lg select-none">2</span>
        <span>
          Elige <strong className="font-semibold text-gray-800">"Agregar a pantalla de inicio"</strong>
        </span>
      </p>
      <p className="flex items-center gap-2.5 text-xs text-gray-600 leading-snug">
        <span className="text-lg select-none">3</span>
        <span>Toca <strong className="font-semibold text-gray-800">"Agregar"</strong> para confirmar</span>
      </p>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────

export default function InstallPrompt() {
  const [show, setShow] = useState(false);
  const [platform, setPlatform] = useState<'android' | 'ios' | null>(null);
  const deferredPromptRef = useRef<BeforeInstallPromptEvent | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Guard: skip in preview mode, already installed, or dismissed recently
    if (isPreviewMode() || isInStandaloneMode() || isDismissedRecently()) return;

    const detected = detectPlatform();

    if (detected === 'ios') {
      // iOS: Safari doesn't fire beforeinstallprompt.
      // Show instructions after a 3.5s delay (let user read the invitation first).
      setPlatform('ios');
      timerRef.current = setTimeout(() => setShow(true), 3500);
      return;
    }

    // Android / Chrome / Edge: wait for the browser's install event.
    const handler = (e: Event) => {
      e.preventDefault(); // suppress browser's default mini-infobar
      deferredPromptRef.current = e as BeforeInstallPromptEvent;
      setPlatform('android');
      timerRef.current = setTimeout(() => setShow(true), 3000);
    };

    window.addEventListener('beforeinstallprompt', handler);

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleInstall = async () => {
    if (!deferredPromptRef.current) return;
    try {
      await deferredPromptRef.current.prompt();
      const { outcome } = await deferredPromptRef.current.userChoice;
      if (outcome === 'dismissed') markDismissed();
      // 'accepted' — no need to dismiss-mark, they installed it
    } catch {
      // Prompt already used or browser rejected — ignore
    }
    deferredPromptRef.current = null;
    setShow(false);
  };

  const handleDismiss = () => {
    markDismissed();
    setShow(false);
    if (timerRef.current) clearTimeout(timerRef.current);
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <AnimatePresence>
      {show && platform && (
        <motion.div
          initial={{ y: '100%', opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: '100%', opacity: 0 }}
          transition={{ type: 'spring', stiffness: 320, damping: 32 }}
          // env(safe-area-inset-bottom) keeps the banner above iPhone home indicator
          className="fixed bottom-0 left-0 right-0 z-50 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
          role="dialog"
          aria-modal="true"
          aria-label={platform === 'android' ? 'Instalar EventiApp' : 'Agregar a pantalla de inicio'}
        >
          <div className="mx-auto max-w-sm rounded-3xl bg-white shadow-2xl overflow-hidden ring-1 ring-black/5">
            {/* Pink gradient header stripe */}
            <div
              className="h-1 w-full"
              style={{ background: 'linear-gradient(90deg, #dd2284, #ff6bb5)' }}
              aria-hidden="true"
            />

            <div className="p-5">
              {/* App identity row */}
              <div className="flex items-start gap-4">
                {/* Icon */}
                <div
                  className="w-14 h-14 rounded-2xl flex-shrink-0 flex items-center justify-center shadow-md"
                  style={{ background: '#dd2284' }}
                  aria-hidden="true"
                >
                  <img src="/favicon.svg" alt="" className="w-9 h-9" loading="lazy" decoding="async" />
                </div>

                {/* Text */}
                <div className="flex-1 min-w-0 pt-0.5">
                  <p className="font-bold text-gray-900 text-sm">EventiApp</p>
                  <p className="text-xs text-gray-400 mt-0.5">Tu invitación digital</p>
                  <p className="text-xs text-gray-600 mt-2 leading-relaxed">
                    {platform === 'android'
                      ? 'Instala la app y ve tu invitación aunque no tengas señal.'
                      : 'Agrégala a tu pantalla de inicio para verla sin conexión.'}
                  </p>
                </div>

                {/* Close button */}
                <button
                  onClick={handleDismiss}
                  className="flex-shrink-0 p-1 -mr-1 -mt-1 text-gray-400 hover:text-gray-600 transition-colors rounded-full"
                  aria-label="Cerrar"
                  type="button"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Android CTA */}
              {platform === 'android' && (
                <button
                  onClick={handleInstall}
                  className="mt-4 w-full py-3.5 rounded-2xl text-white text-sm font-semibold shadow-sm transition-transform active:scale-[0.98]"
                  style={{ background: '#dd2284' }}
                  type="button"
                >
                  Instalar app
                </button>
              )}

              {/* iOS instructions */}
              {platform === 'ios' && <IOSInstructions />}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
```

**Step 2: Verify TypeScript compiles**

```bash
cd "C:\Users\AndBe\Desktop\Projects\cafetton-casero"
npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

**Step 3: Commit**

```bash
git add src/components/InstallPrompt.tsx
git commit -m "feat(pwa): add InstallPrompt component (Android + iOS, 7-day dismiss)"
```

---

## Task 8: Mount InstallPrompt in EventPage

**Files:**
- Modify: `src/components/engine/EventPage.tsx`

**Step 1: Add import at the top of EventPage.tsx**

After the existing imports (around line 7, after `import Footer from '../common/Footer';`), add:

```tsx
import InstallPrompt from '../InstallPrompt';
```

**Step 2: Mount InstallPrompt in the return statement**

In the final `return` of `EventPage` (currently lines 355–378), add `<InstallPrompt />` just before the closing `</>`. The full return should look like:

```tsx
  return (
    <>
      {spec.meta.musicUrl && (
        <MusicWidget audioUrl={spec.meta.musicUrl} volume={0.3} />
      )}

      <ShareWidget eventTitle={spec.meta.pageTitle} />

      <main className="max-w-screen-md lg:max-w-[1024px] mx-auto px-3 sm:px-4 py-2 space-y-12 sm:space-y-20 overflow-x-hidden">
        {sorted.map(section => (
          <SectionRenderer
            key={section.sectionId || `${section.type}-${section.order}`}
            spec={section}
            EVENTS_URL={EVENTS_URL}
          />
        ))}

        <div className="overflow-x-hidden">
          <Footer contact={spec.meta.contact} />
        </div>
      </main>

      <InstallPrompt />
    </>
  );
```

**Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

**Step 4: Build to verify no runtime issues**

```bash
npm run build 2>&1 | tail -10
```

Expected: build completes without errors.

**Step 5: Commit**

```bash
git add src/components/engine/EventPage.tsx
git commit -m "feat(pwa): mount InstallPrompt in EventPage"
```

---

## Task 9: Final verification and push

**Step 1: Full build**

```bash
cd "C:\Users\AndBe\Desktop\Projects\cafetton-casero"
npm run build 2>&1
```

Verify ALL of these are present in `dist/`:
- `sw.js` — Workbox service worker
- `workbox-*.js` — Workbox runtime chunks
- `manifest.webmanifest`
- `icons/pwa-192.png`
- `icons/pwa-512.png`
- `icons/pwa-512-maskable.png`
- `offline/index.html` (or `offline.html`) — prerendered offline page

```bash
ls dist/sw.js dist/manifest.webmanifest dist/icons/ && (ls dist/offline/index.html 2>/dev/null || ls dist/offline.html 2>/dev/null) && echo "✅ All PWA assets present"
```

**Step 2: Check SW contains the expected cache names**

```bash
grep -c "api-cache\|s3-images\|event-pages" dist/sw.js
```

Expected: `3` (all 3 cache names are present in the SW).

**Step 3: Verify manifest link in prerendered offline page**

```bash
grep -c "manifest.webmanifest" dist/offline/index.html 2>/dev/null || grep -c "manifest.webmanifest" dist/offline.html 2>/dev/null
```

Expected: `1`

**Step 4: Push**

```bash
git push origin main
```

Expected: CI passes, Cloudflare Pages deploys successfully.

---

## Edge Cases Handled

| Scenario | Handled by |
|----------|-----------|
| User already installed (standalone mode) | `isInStandaloneMode()` check — prompt never shows |
| User dismissed < 7 days ago | `isDismissedRecently()` check |
| Dashboard preview mode (`?preview=1`) | `isPreviewMode()` check — prompt suppressed |
| iOS (no `beforeinstallprompt`) | Platform detection → manual instructions |
| Android Chrome (has `beforeinstallprompt`) | Event capture + custom prompt |
| Offline navigation to cached event page | NetworkFirst SW cache serves HTML → React renders |
| Offline navigation to uncached URL | `navigateFallback: '/offline'` |
| API calls while offline (cached) | StaleWhileRevalidate cache hit |
| API calls while offline (no cache) | Error handled by EventPage's existing retry logic |
| S3 presigned URL expiry vs cache | 7-day SW cache < 12-hour presign TTL = cache always valid |
| Video files excluded from S3 cache | Regex `\.(mp4|webm|...)` exclusion in urlPattern |
| Safari private mode (localStorage blocked) | All `localStorage` calls are try/catch — silent fail |
| Phone storage full | `sharp` not in CI, icons committed to git |
| Service worker update | `registerType: 'autoUpdate'` — silently updates on next visit |
| iPhone home indicator overlap | `pb-[max(1rem,env(safe-area-inset-bottom))]` on banner |
