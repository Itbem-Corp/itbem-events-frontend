// tests/graduation-page.spec.ts
// Tests for /graduacion-izapa — graduation event page.
//
// Phase 2 SDUI: EventPage fetches page-spec from API using ?token=.
// All API calls are intercepted via route mocks (no real network needed).
//
// Island hydration strategy (managed by SectionRenderer IntersectionObserver):
//   hydration:'immediate' → CountdownHeader, GraduationHero, EventVenue — hydrate right away
//   hydration:'visible'   → Reception, GraduatesList, PhotoGrid — hydrate when scrolled near viewport

import { test, expect, type Page } from '@playwright/test';
import {
  mockGraduationPageSpec,
  mockGraduationResources,
  mockGraduationAttendees,
  installApiGuard,
  API_BASE,
} from './helpers/mocks';
import { installStorageClearScript } from './helpers/storage';
import { SECTION_IDS, TEST_TOKENS, TEST_GRADUATION_ATTENDEES } from './fixtures/api-data';

const PAGE_URL = `/graduacion-izapa?token=${TEST_TOKENS.graduation}`;

test.beforeEach(async ({ page }) => {
  // Clear resource/spec/attendees cache BEFORE any page JS runs (race-free)
  await installStorageClearScript(page);
  // Guard FIRST (lowest priority), specific mocks AFTER (higher priority).
  // Playwright is LIFO: last registered route wins.
  await installApiGuard(page);
  await mockGraduationPageSpec(page);
  await mockGraduationResources(page);
  await mockGraduationAttendees(page);
  await page.goto(PAGE_URL);
});

// ---------------------------------------------------------------------------
// Above fold (hydrate immediately)
// ---------------------------------------------------------------------------
test.describe('Estructura y contenido above-fold', () => {

  test('título de página correcto', async ({ page }) => {
    // EventPage sets document.title from spec meta.pageTitle
    await expect(page).toHaveTitle('Nos Graduamos 2022-2025 | El Gran Día', { timeout: 10_000 });
  });

  test('countdown muestra las 4 etiquetas de tiempo', async ({ page }) => {
    for (const label of ['Días', 'Horas', 'Minutos', 'Segundos']) {
      await expect(page.getByText(label)).toBeVisible({ timeout: 10_000 });
    }
  });

  test('countdown muestra ceros cuando la fecha ya pasó (2025-06-22)', async ({ page }) => {
    // tabular-nums class is on <span> inside AnimatedDigit
    const digits = page.locator('.tabular-nums');
    await expect(digits.first()).toBeVisible({ timeout: 10_000 });
    const count = await digits.count();
    expect(count).toBeGreaterThanOrEqual(4);
    for (let i = 0; i < count; i++) {
      await expect(digits.nth(i)).toHaveText('0');
    }
  });

  test('music widget visible en esquina inferior izquierda', async ({ page }) => {
    const widget = page.locator('.fixed.bottom-5.left-5, [class*="fixed"][class*="bottom"]').first();
    await expect(widget).toBeVisible({ timeout: 10_000 });
  });

  test('Section 1 renderiza "NOS GRADUAMOS"', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'NOS GRADUAMOS' }))
      .toBeVisible({ timeout: 10_000 });
  });

  test('Section 1 renderiza "2022 - 2025"', async ({ page }) => {
    await expect(page.getByRole('heading', { name: '2022 - 2025' }))
      .toBeVisible({ timeout: 10_000 });
  });

  test('Section 1 renderiza "PREPARATORIA"', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'PREPARATORIA' }))
      .toBeVisible({ timeout: 10_000 });
  });

  test('Section 1 skeleton desaparece después de que carguen los datos', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'NOS GRADUAMOS' }))
      .toBeVisible({ timeout: 10_000 });
    // Check the page-level skeleton <main class="...animate-pulse"> is gone.
    // Use main.animate-pulse (not a descendant selector) to avoid matching the
    // hydration placeholders of below-fold sections, which also use animate-pulse.
    await expect(page.locator('main.animate-pulse')).not.toBeVisible({ timeout: 5_000 });
  });

  test('Section 2 renderiza texto de la misa', async ({ page }) => {
    await expect(page.getByText(/Santuario la Villita de Guadalupe/i))
      .toBeVisible({ timeout: 10_000 });
  });

  test('Section 2 renderiza fecha "22 de junio del 2025"', async ({ page }) => {
    await expect(page.getByText(/22 de junio del 2025/i)).toBeVisible({ timeout: 10_000 });
  });
});

// ---------------------------------------------------------------------------
// Below fold (hydrate when scrolled near viewport)
// ---------------------------------------------------------------------------
test.describe('Secciones below-fold (visible hydration)', () => {

  async function scrollToFraction(page: Page, fraction: number): Promise<void> {
    // Wait for above-fold content so page-spec is fully rendered before we measure
    // scrollHeight.  Without this guard the skeleton height (~200-400 px) is used,
    // which leaves below-fold sections out of view after the scroll completes.
    await page.getByRole('heading', { name: 'NOS GRADUAMOS' }).waitFor({ timeout: 10_000 });
    await page.evaluate(
      (f) => window.scrollTo(0, document.body.scrollHeight * f),
      fraction
    );
    await page.waitForTimeout(600);
  }

  test('Section 3 hidrata y muestra texto del hotel', async ({ page }) => {
    await scrollToFraction(page, 0.6);
    await expect(page.getByText(/Holiday Inn|Salón Barista/i))
      .toBeVisible({ timeout: 15_000 });
  });

  test('Section 3 renderiza iframe de Google Maps para recepción', async ({ page }) => {
    await scrollToFraction(page, 0.6);
    const iframe = page.locator('iframe').first();
    await expect(iframe).toBeAttached({ timeout: 15_000 });
  });

  test('Section 4 hidrata y renderiza heading "Graduados"', async ({ page }) => {
    // Scroll past all sections — below-fold placeholders are h-64, so fractional
    // scrolling under-estimates the target. A large absolute value is reliable.
    await scrollToFraction(page, 1.0);
    await expect(page.getByRole('heading', { name: 'Graduados' }))
      .toBeVisible({ timeout: 15_000 });
  });

  test('Section 4 muestra exactamente 3 nombres de graduados desde DB', async ({ page }) => {
    await scrollToFraction(page, 1.0);
    await expect(page.getByRole('heading', { name: 'Graduados' }))
      .toBeVisible({ timeout: 15_000 });
    const items = page.getByRole('listitem');
    await expect(items).toHaveCount(TEST_GRADUATION_ATTENDEES.length);
  });

  test('Section 4 incluye nombres específicos de la lista de DB', async ({ page }) => {
    await scrollToFraction(page, 1.0);
    await expect(page.getByText('Ana Gloria Vásquez Velázquez')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Valeria Trujillo Iniesta')).toBeVisible({ timeout: 15_000 });
  });

  test('Section 5 hidrata y renderiza grids de fotos', async ({ page }) => {
    await scrollToFraction(page, 1);
    const grids = page.locator('.grid-cols-2, .grid-cols-3');
    await expect(grids.first()).toBeVisible({ timeout: 15_000 });
  });

  test('Footer visible con número de WhatsApp', async ({ page }) => {
    await scrollToFraction(page, 1);
    await expect(page.getByText('9999988610')).toBeVisible({ timeout: 10_000 });
  });

  test('Footer visible con email de contacto', async ({ page }) => {
    await scrollToFraction(page, 1);
    await expect(page.getByText('contacto.eventiapp@itbem.com')).toBeVisible({ timeout: 10_000 });
  });
});

// ---------------------------------------------------------------------------
// API y caché
// ---------------------------------------------------------------------------
test.describe('Comportamiento de API y caché', () => {

  test('sessionStorage almacena page-spec después de carga inicial', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'NOS GRADUAMOS' }))
      .toBeVisible({ timeout: 10_000 });

    const cached = await page.evaluate(
      (k) => sessionStorage.getItem(k),
      `pageSpec-${TEST_TOKENS.graduation}`
    );
    expect(cached).not.toBeNull();
    const { spec } = JSON.parse(cached!);
    expect(spec.meta.pageTitle).toBe('Nos Graduamos 2022-2025 | El Gran Día');
    expect(Array.isArray(spec.sections)).toBe(true);
  });

  test('sessionStorage almacena attendees después de cargar GraduatesList', async ({ page }) => {
    // Wait for above-fold content before scrolling (same reason as scrollToFraction helper).
    await page.getByRole('heading', { name: 'NOS GRADUAMOS' }).waitFor({ timeout: 10_000 });
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(600);
    await expect(page.getByRole('heading', { name: 'Graduados' })).toBeVisible({ timeout: 15_000 });

    const cacheKey = `attendees-${SECTION_IDS.graduation.s4}`;
    const cached = await page.evaluate((k) => sessionStorage.getItem(k), cacheKey);
    expect(cached).not.toBeNull();
    const { data } = JSON.parse(cached!);
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBe(TEST_GRADUATION_ATTENDEES.length);
  });

  test('sessionStorage almacena resources de Section 1', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'NOS GRADUAMOS' }))
      .toBeVisible({ timeout: 10_000 });

    const cacheKey = `resourcesBySection-${SECTION_IDS.graduation.s1}`;
    const cached = await page.evaluate((k) => sessionStorage.getItem(k), cacheKey);
    expect(cached).not.toBeNull();
    const parsed = JSON.parse(cached!);
    expect(parsed.sectionId).toBe(SECTION_IDS.graduation.s1);
    expect(parsed.sectionResources.length).toBe(2);
  });

  test('sin token muestra error "Token requerido"', async ({ page }) => {
    await installStorageClearScript(page);
    await page.goto('/graduacion-izapa');
    await expect(page.getByText(/Token requerido/i)).toBeVisible({ timeout: 10_000 });
  });

  test('page-spec 404 muestra mensaje de invitación no encontrada', async ({ page }) => {
    await installStorageClearScript(page);
    await page.route(`${API_BASE}/api/events/page-spec?token=invalid`, async (route) => {
      await route.fulfill({ status: 404, body: '{}' });
    });
    await page.goto('/graduacion-izapa?token=invalid');
    await expect(page.getByText(/Invitación no encontrada/i)).toBeVisible({ timeout: 10_000 });
  });

  test('error de API de resources mantiene skeleton sin crashear', async ({ page }) => {
    await page.route(
      `${API_BASE}/api/resources/section/${SECTION_IDS.graduation.s1}`,
      async (route) => { await route.fulfill({ status: 500, body: 'error' }); }
    );
    await page.goto(PAGE_URL);
    await expect(page.locator('.animate-pulse').first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Something went wrong')).not.toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Responsive
// ---------------------------------------------------------------------------
test.describe('Layout responsive', () => {

  test('countdown digits no se salen del viewport en mobile', async ({ page }) => {
    const diasLabel = page.getByText('Días');
    await expect(diasLabel).toBeVisible({ timeout: 10_000 });
    const box = await diasLabel.boundingBox();
    if (box) {
      const viewport = page.viewportSize();
      if (viewport) {
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
      }
    }
  });

  test('hero text "NOS GRADUAMOS" no desborda el viewport', async ({ page }) => {
    const heading = page.getByRole('heading', { name: 'NOS GRADUAMOS' });
    await expect(heading).toBeVisible({ timeout: 10_000 });
    const box = await heading.boundingBox();
    const viewport = page.viewportSize();
    if (box && viewport) {
      expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 2);
    }
  });
});
