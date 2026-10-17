import { readFileSync } from 'fs';
import { join } from 'path';
import { expect, test, type Page } from '@playwright/test';

/**
 * EV-31 performance budget for the visual base (motion-system #32):
 * 60 fps on a mid-range device and CLS below 0.1, in Chromium and WebKit.
 *
 * The page is built from src/styles/visual-base.css only, so the budget is
 * measured on the shared layer without depending on a public route or API.
 * Each budget has a negative control that must break it, so the gate cannot
 * pass vacuously.
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

function budgetPage({ reserveSpace }: { reserveSpace: boolean }): string {
  const tiles = Array.from({ length: TILES }, (_, i) => {
    const ratio = TILE_RATIOS[i % TILE_RATIOS.length];
    const style = reserveSpace ? ` style="--v-ratio:${ratio}"` : ' style="aspect-ratio:auto"';
    return `<div class="v-masonry__item v-scroll-in" data-tile="${i}" data-ratio="${ratio}"${style}></div>`;
  });
  const columns = [0, 1, 2].map(
    (col) =>
      `<div class="v-masonry__col">${tiles.filter((_, i) => i % 3 === col).join('')}</div>`,
  );
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
  <main class="v-masonry" data-lanes="false">${columns.join('')}</main>
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
