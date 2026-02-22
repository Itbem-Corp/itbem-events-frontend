// tests/moments-wall.spec.ts
// E2E tests for the MomentWall section — public photo/video wall + guest upload flow.
//
// Uses the generic /evento route with a mocked page-spec that returns a single
// MomentWall section. All API calls are intercepted via route mocks; no real
// network traffic is needed.

import { test, expect } from '@playwright/test';
import {
  mockMomentWallPageSpec,
  mockMomentsGet,
  mockMomentsPost,
  mockMomentWallInvitation,
  installApiGuard,
  MOMENT_TEST_TOKEN,
  API_BASE,
} from './helpers/mocks';
import { installStorageClearScript } from './helpers/storage';
import { makeMoment, MOMENT_EVENT_IDENTIFIER } from './fixtures/api-data';

const PAGE_URL      = `/evento?token=${MOMENT_TEST_TOKEN}`;
const PAGE_URL_ANON = `/evento`; // no token = anonymous visitor

// Standard setup: clear cache, guard first (lowest priority), then specific mocks.
// Playwright routes are LIFO: last registered wins.
test.beforeEach(async ({ page }) => {
  await installStorageClearScript(page);
  await installApiGuard(page);
  await mockMomentWallPageSpec(page);
});

// ---------------------------------------------------------------------------
// Upload button visibility
// ---------------------------------------------------------------------------
test.describe('Upload button visibility', () => {

  test('upload button visible for authenticated guest with pretty token', async ({ page }) => {
    await mockMomentWallInvitation(page);
    await mockMomentsGet(page, MOMENT_EVENT_IDENTIFIER, []);
    await page.goto(PAGE_URL);
    await expect(page.getByRole('button', { name: /Subir foto o video/ })).toBeVisible({ timeout: 15_000 });
  });

  test('upload button NOT visible for anonymous visitor (no token in URL)', async ({ page }) => {
    await mockMomentsGet(page, MOMENT_EVENT_IDENTIFIER, []);
    await page.goto(PAGE_URL_ANON);
    // Wait for wall to fully hydrate — empty state proves the component rendered
    await expect(page.getByText(/Aún no hay momentos compartidos/)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('button', { name: /Subir foto o video/ })).not.toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Upload modal
// ---------------------------------------------------------------------------
test.describe('Upload modal', () => {

  test.beforeEach(async ({ page }) => {
    await mockMomentWallInvitation(page);
    await mockMomentsGet(page, MOMENT_EVENT_IDENTIFIER, []);
    await page.goto(PAGE_URL);
    await expect(page.getByRole('button', { name: /Subir foto o video/ })).toBeVisible({ timeout: 15_000 });
  });

  test('upload modal opens on button click', async ({ page }) => {
    await page.getByRole('button', { name: /Subir foto o video/ }).click();
    await expect(page.getByRole('heading', { name: 'Subir foto o video' })).toBeVisible({ timeout: 5_000 });
  });

  test('upload modal closes on cancel button', async ({ page }) => {
    await page.getByRole('button', { name: /Subir foto o video/ }).click();
    await expect(page.getByRole('heading', { name: 'Subir foto o video' })).toBeVisible({ timeout: 5_000 });
    await page.getByRole('button', { name: 'Cancelar' }).click();
    await expect(page.getByRole('heading', { name: 'Subir foto o video' })).not.toBeVisible({ timeout: 3_000 });
  });

  test('successful upload shows "Aparecerá aquí cuando sea aprobado" toast', async ({ page }) => {
    await mockMomentsPost(page, MOMENT_EVENT_IDENTIFIER, true);
    await page.getByRole('button', { name: /Subir foto o video/ }).click();
    await expect(page.getByRole('heading', { name: 'Subir foto o video' })).toBeVisible({ timeout: 5_000 });
    await page.locator('input[type="file"]').setInputFiles({
      name: 'photo.jpg',
      mimeType: 'image/jpeg',
      buffer: Buffer.from('fake-image-data'),
    });
    await page.getByRole('button', { name: 'Subir' }).click();
    await expect(page.getByText(/Aparecerá aquí cuando sea aprobado/)).toBeVisible({ timeout: 10_000 });
  });

  test('failed upload (500) shows error message inside the modal', async ({ page }) => {
    await mockMomentsPost(page, MOMENT_EVENT_IDENTIFIER, false);
    await page.getByRole('button', { name: /Subir foto o video/ }).click();
    await expect(page.getByRole('heading', { name: 'Subir foto o video' })).toBeVisible({ timeout: 5_000 });
    await page.locator('input[type="file"]').setInputFiles({
      name: 'photo.jpg',
      mimeType: 'image/jpeg',
      buffer: Buffer.from('fake-image-data'),
    });
    await page.getByRole('button', { name: 'Subir' }).click();
    // <p class="text-sm text-red-600"> inside the modal
    await expect(page.locator('.text-red-600')).toBeVisible({ timeout: 10_000 });
  });
});

// ---------------------------------------------------------------------------
// Moments grid
// ---------------------------------------------------------------------------
test.describe('Moments grid', () => {

  test('approved moments are displayed in the grid', async ({ page }) => {
    const moments = [
      makeMoment({ id: 'img-1', content_url: 'moments/test/img-1.webp', description: 'Foto uno' }),
      makeMoment({ id: 'img-2', content_url: 'moments/test/img-2.webp', description: 'Foto dos' }),
    ];
    await mockMomentsGet(page, MOMENT_EVENT_IDENTIFIER, moments);
    await page.goto(PAGE_URL_ANON);
    await expect(page.locator('img[alt="Foto uno"]')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('img[alt="Foto dos"]')).toBeVisible({ timeout: 5_000 });
  });

  test('empty state shown when no moments exist', async ({ page }) => {
    await mockMomentsGet(page, MOMENT_EVENT_IDENTIFIER, []);
    await page.goto(PAGE_URL_ANON);
    await expect(page.getByText(/Aún no hay momentos compartidos/)).toBeVisible({ timeout: 15_000 });
  });

  test('section title and subtitle are displayed', async ({ page }) => {
    await mockMomentsGet(page, MOMENT_EVENT_IDENTIFIER, []);
    await page.goto(PAGE_URL_ANON);
    await expect(page.getByRole('heading', { name: 'Momentos' })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Comparte tus fotos favoritas')).toBeVisible({ timeout: 5_000 });
  });

  test('click on image opens the lightbox', async ({ page }) => {
    const moments = [
      makeMoment({ id: 'img-1', content_url: 'moments/test/img-1.webp', description: 'Foto del evento' }),
    ];
    await mockMomentsGet(page, MOMENT_EVENT_IDENTIFIER, moments);
    await page.goto(PAGE_URL_ANON);
    await expect(page.locator('img[alt="Foto del evento"]')).toBeVisible({ timeout: 15_000 });
    await page.locator('button', { has: page.locator('img[alt="Foto del evento"]') }).click();
    // Close button only appears when lightbox is open
    await expect(page.getByRole('button', { name: 'Cerrar' })).toBeVisible({ timeout: 5_000 });
  });

  test('lightbox closes when Escape key is pressed', async ({ page }) => {
    const moments = [
      makeMoment({ id: 'img-1', content_url: 'moments/test/img-1.webp', description: 'Foto del evento' }),
    ];
    await mockMomentsGet(page, MOMENT_EVENT_IDENTIFIER, moments);
    await page.goto(PAGE_URL_ANON);
    await expect(page.locator('img[alt="Foto del evento"]')).toBeVisible({ timeout: 15_000 });
    // Open lightbox
    await page.locator('button', { has: page.locator('img[alt="Foto del evento"]') }).click();
    await expect(page.getByRole('button', { name: 'Cerrar' })).toBeVisible({ timeout: 5_000 });
    // Close with Escape
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'Cerrar' })).not.toBeVisible({ timeout: 5_000 });
  });
});

// ---------------------------------------------------------------------------
// Rate-limit (429) handling
// ---------------------------------------------------------------------------
test.describe('Rate-limit (429) handling', () => {

  test('429 response shows custom thank-you message in the modal', async ({ page }) => {
    await mockMomentWallInvitation(page);
    await mockMomentsGet(page, MOMENT_EVENT_IDENTIFIER, []);
    await page.goto(PAGE_URL);
    await expect(page.getByRole('button', { name: /Subir foto o video/ })).toBeVisible({ timeout: 15_000 });

    // Override: POST returns 429
    await page.route(
      `${API_BASE}/api/events/${MOMENT_EVENT_IDENTIFIER}/moments`,
      async (route) => {
        if (route.request().method() !== 'POST') { await route.continue(); return; }
        await route.fulfill({
          status: 429,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'Ya registramos tus 3 contribuciones', already_uploaded: true }),
        });
      }
    );

    await page.getByRole('button', { name: /Subir foto o video/ }).click();
    await expect(page.getByRole('heading', { name: 'Subir foto o video' })).toBeVisible({ timeout: 5_000 });
    await page.locator('input[type="file"]').setInputFiles({ name: 'photo.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('x') });
    await page.getByRole('button', { name: 'Subir' }).click();
    await expect(page.getByText(/Ya registramos tus 3 contribuciones/)).toBeVisible({ timeout: 10_000 });
  });
});
