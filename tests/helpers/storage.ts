// tests/helpers/storage.ts
// Utilities for clearing sessionStorage/localStorage caches used by
// ResourcesBySectionSingle, EventPage, and GraduatesList before each test.
//
// addInitScript() is preferred over page.evaluate() because it runs
// synchronously BEFORE any module script — before React hydrates,
// before the first useEffect reads the cache.

import type { Page } from '@playwright/test';

export async function installStorageClearScript(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const sessionPrefixes = ['resourcesBySection-', 'pageSpec-', 'attendees-'];
    const localPrefixes   = ['resourcesExpiry-'];

    for (let i = sessionStorage.length - 1; i >= 0; i--) {
      const k = sessionStorage.key(i);
      if (k && sessionPrefixes.some(p => k.startsWith(p))) sessionStorage.removeItem(k);
    }
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k && localPrefixes.some(p => k.startsWith(p))) localStorage.removeItem(k);
    }
  });
}
