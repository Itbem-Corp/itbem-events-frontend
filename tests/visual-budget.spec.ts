import { readFileSync } from 'fs';
import { join } from 'path';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { expect, test, type Page } from '@playwright/test';

import { Masonry } from '../src/components/visual/Masonry';

/**
 * EV-31 performance budget for the visual base (motion-system #32):
 * 60 fps on a mid-range device and CLS below 0.1, in Chromium and WebKit.
 *
 * The masonry is the real <Masonry> server render (what an SSR island paints
 * before hydration) styled by src/styles/visual-base.css. The component keeps
 * no client state, so hydration does not change that markup (unit-tested in
 * tests/unit/visualBase.test.ts). Each budget has a negative control that
 * must break it, so the gate cannot pass vacuously.
 */

const VISUAL_CSS = readFileSync(join(process.cwd(), 'src/styles/visual-base.css'), 'utf8');

const FPS_TARGET = 60;
/** Mean frame rate floor: 60 fps with ~8 % tolerance for timer jitter. */
const MIN_MEAN_FPS = 55;
/** A single frame over this is a visible hitch (Long Animation Frame threshold). */
const MAX_FRAME_MS = 50;
const MAX_CLS = 0.1;
/** Lighthouse's mobile preset: 4x CPU slowdown approximates a mid-range phone. */
const MID_RANGE_CPU_THROTTLE = 4;

const TILE_RATIOS = [0.66, 1.5, 1, 0.75, 1.33, 0.8, 1.25, 0.56];
const TILES = 48;

function masonryServerHtml(): string {
  const items = Array.from({ length: TILES }, (_, i) => {
    const ratio = TILE_RATIOS[i % TILE_RATIOS.length];
    return { id: String(i), width: Math.round(1000 * ratio), height: 1000, ratio };
  });
  return renderToString(
    createElement(Masonry, {
      items,
      renderItem: (item: (typeof items)[number]) =>
        createElement('div', {
          className: 'v-scroll-in',
          'data-tile': item.id,
          'data-ratio': String(item.ratio),
          style: { width: '100%', height: '100%' },
        }),
    }),
  );
}

/** Same tiles without reserved space: only the negative control uses it. */
function unreservedHtml(): string {
  const tiles = Array.from({ length: TILES }, (_, i) => {
    const ratio = TILE_RATIOS[i % TILE_RATIOS.length];
    return `<div class="v-masonry__item v-scroll-in" data-tile="${i}" data-ratio="${ratio}" style="aspect-ratio:auto;position:static;width:100%"></div>`;
  });
  return `<div class="v-masonry"><div class="v-masonry__stage" style="position:static;display:flex;flex-direction:column">${tiles.join('')}</div></div>`;
}

function budgetPage({ reserveSpace }: { reserveSpace: boolean }): string {
  const masonry = reserveSpace ? masonryServerHtml() : unreservedHtml();
  return `<!doctype html>
<html lang="es" data-eventi-theme="velada" data-eventi-kind="boda">
<head>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>${VISUAL_CSS}</style>
<style>
  body { margin: 0; background: var(--v-seed-base); }
  .v-bg { position: fixed; inset: 0; z-index: -1; }
  header { height: 60vh; }
</style>
</head>
<body>
  <div class="v-bg v-bg-drift"></div>
  <header class="v-scroll-in"></header>
  <main>${masonry}</main>
</body>
</html>`;
}

/** Inserts each tile's image later, as the network would. Sized by the image. */
async function loadImagesLate(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const tiles = [...document.querySelectorAll<HTMLElement>('[data-tile]')];
    for (const tile of tiles) {
      const ratio = Number(tile.dataset.ratio);
      const img = document.createElement('img');
      img.alt = '';
      img.src =
        'data:image/svg+xml;utf8,' +
        encodeURIComponent(
          `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(300 * ratio)}" height="300"><rect width="100%" height="100%" fill="#e8c987"/></svg>`,
        );
      img.style.width = '100%';
      img.style.height = tile.style.aspectRatio === 'auto' ? 'auto' : '100%';
      img.style.display = 'block';
      await img.decode().catch(() => undefined);
      tile.appendChild(img);
      await new Promise((r) => requestAnimationFrame(() => r(null)));
    }
  });
}

interface StabilityResult {
  /** Chromium's layout-shift score; null where the API does not exist (WebKit). */
  cls: number | null;
  /** Engine-independent: viewport-weighted shift of tiles that moved, CLS-like. */
  manualShift: number;
}

async function measureStability(page: Page): Promise<StabilityResult> {
  await page.evaluate(() => {
    const w = window as unknown as { __cls: number | null; __rects: Map<string, DOMRect> };
    w.__cls = null;
    const supported =
      typeof PerformanceObserver !== 'undefined' &&
      PerformanceObserver.supportedEntryTypes?.includes('layout-shift');
    if (supported) {
      w.__cls = 0;
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries() as unknown as { value: number; hadRecentInput: boolean }[]) {
          if (!entry.hadRecentInput) w.__cls = (w.__cls ?? 0) + entry.value;
        }
      }).observe({ type: 'layout-shift', buffered: true });
    }
    w.__rects = new Map(
      [...document.querySelectorAll<HTMLElement>('[data-tile]')].map((el) => [
        el.dataset.tile!,
        el.getBoundingClientRect(),
      ]),
    );
  });

  await loadImagesLate(page);

  return page.evaluate(async () => {
    await new Promise((r) => setTimeout(r, 300));
    const w = window as unknown as { __cls: number | null; __rects: Map<string, DOMRect> };
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let manualShift = 0;
    for (const el of document.querySelectorAll<HTMLElement>('[data-tile]')) {
      const before = w.__rects.get(el.dataset.tile!)!;
      const after = el.getBoundingClientRect();
      const distance = Math.max(Math.abs(after.top - before.top), Math.abs(after.left - before.left));
      if (distance < 1) continue;
      // Impact region as in CLS: union of the before and after boxes, clipped to the viewport.
      const top = Math.max(0, Math.min(before.top, after.top));
      const bottom = Math.min(vh, Math.max(before.bottom, after.bottom));
      const impact = (Math.max(0, bottom - top) * Math.min(Math.max(before.width, after.width), vw)) / (vw * vh);
      manualShift += impact * Math.min(1, distance / Math.max(vw, vh));
    }
    return { cls: w.__cls, manualShift };
  });
}

interface FrameResult {
  meanFps: number;
  maxFrameMs: number;
  frames: number;
}

/** Scrolls the page for ~2 s, one step per frame, and records frame intervals. */
async function measureFrames(page: Page, extraWorkMs = 0): Promise<FrameResult> {
  return page.evaluate(async (busyMs) => {
    const deltas: number[] = [];
    const max = document.documentElement.scrollHeight - window.innerHeight;
    await new Promise<void>((resolve) => {
      let last = performance.now();
      const start = last;
      const step = (now: number) => {
        deltas.push(now - last);
        last = now;
        window.scrollTo(0, ((now - start) / 2000) * max);
        if (busyMs > 0) {
          const until = performance.now() + busyMs;
          while (performance.now() < until) {
            /* simulate main-thread work that blows the budget */
          }
        }
        if (now - start < 2000) requestAnimationFrame(step);
        else resolve();
      };
      requestAnimationFrame(step);
    });
    // The first interval includes the scheduling delay before the loop started.
    const measured = deltas.slice(1);
    const total = measured.reduce((a, b) => a + b, 0);
    return {
      meanFps: (measured.length / total) * 1000,
      maxFrameMs: Math.max(...measured),
      frames: measured.length,
    };
  }, extraWorkMs);
}

async function throttleLikeMidRange(page: Page, browserName: string): Promise<void> {
  // CPU throttling exists only through the Chrome DevTools Protocol.
  if (browserName !== 'chromium') return;
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: MID_RANGE_CPU_THROTTLE });
}

test.describe('visual base performance budget', () => {
  test('paints the masonry columns from the server HTML, before any script runs', async ({ page }) => {
    await page.setContent(budgetPage({ reserveSpace: true }));

    const layout = await page.evaluate(() => {
      const rects = [...document.querySelectorAll<HTMLElement>('.v-masonry__item')].map((el) =>
        el.getBoundingClientRect(),
      );
      const overlaps = rects.some((a, i) =>
        rects.some(
          (b, j) =>
            j > i && a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1,
        ),
      );
      return {
        scripts: document.scripts.length,
        items: rects.length,
        columns: new Set(rects.map((r) => Math.round(r.left))).size,
        minHeight: Math.min(...rects.map((r) => r.height)),
        stageHeight: document.querySelector('.v-masonry__stage')!.getBoundingClientRect().height,
        lastBottom: Math.max(...rects.map((r) => r.bottom)) - document.querySelector('.v-masonry__stage')!.getBoundingClientRect().top,
        overlaps,
      };
    });
    test.info().annotations.push({ type: 'layout', description: JSON.stringify(layout) });

    expect(layout.scripts).toBe(0);
    expect(layout.items).toBe(TILES);
    // 393 px (Pixel 5) and 390 px (iPhone 13) wide at 150 px minimum: 2 columns.
    expect(layout.columns).toBe(2);
    expect(layout.minHeight).toBeGreaterThan(0);
    expect(layout.overlaps).toBe(false);
    // The stage reserves the tallest column, so content after it does not move.
    expect(Math.abs(layout.stageHeight - layout.lastBottom)).toBeLessThan(2);
  });

  test(`keeps ${FPS_TARGET} fps while scrolling the scroll-driven masonry`, async ({ page, browserName }) => {
    await page.setContent(budgetPage({ reserveSpace: true }));
    await loadImagesLate(page);
    await throttleLikeMidRange(page, browserName);

    const result = await measureFrames(page);
    test.info().annotations.push({ type: 'frames', description: JSON.stringify(result) });

    expect(result.frames).toBeGreaterThan(30);
    expect(result.meanFps).toBeGreaterThanOrEqual(MIN_MEAN_FPS);
    expect(result.maxFrameMs).toBeLessThanOrEqual(MAX_FRAME_MS);
  });

  test('keeps CLS below 0.1 when images arrive after layout', async ({ page }) => {
    await page.setContent(budgetPage({ reserveSpace: true }));

    const result = await measureStability(page);
    test.info().annotations.push({ type: 'stability', description: JSON.stringify(result) });

    expect(result.manualShift).toBeLessThan(MAX_CLS);
    if (result.cls !== null) expect(result.cls).toBeLessThan(MAX_CLS);
  });

  test('negative control: the frame budget fails on a page that blocks each frame', async ({ page }) => {
    await page.setContent(budgetPage({ reserveSpace: true }));

    const result = await measureFrames(page, 60);

    expect(result.maxFrameMs).toBeGreaterThan(MAX_FRAME_MS);
    expect(result.meanFps).toBeLessThan(MIN_MEAN_FPS);
  });

  test('negative control: the CLS budget fails when tiles do not reserve space', async ({ page }) => {
    await page.setContent(budgetPage({ reserveSpace: false }));

    const result = await measureStability(page);

    expect(result.manualShift).toBeGreaterThanOrEqual(MAX_CLS);
    if (result.cls !== null) expect(result.cls).toBeGreaterThanOrEqual(MAX_CLS);
  });
});
