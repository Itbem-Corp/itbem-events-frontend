import { test, expect } from '@playwright/test';
import {
  installApiGuard,
  mockSharedBatchUploadUrls,
  mockSharedMomentConfirm,
  mockSharedUploadStatus,
} from './helpers/mocks';
import { installStorageClearScript } from './helpers/storage';
import { MOMENT_EVENT_IDENTIFIER } from './fixtures/api-data';

const PAGE_URL = `/events/upload?e=${MOMENT_EVENT_IDENTIFIER}`;

test.beforeEach(async ({ page }) => {
  await installStorageClearScript(page);
  await installApiGuard(page);
});

test.describe('Shared upload page', () => {
  test('shows clear recovery guidance when the QR link is incomplete', async ({ page }) => {
    await page.goto('/events/upload');

    await expect(
      page.getByRole('heading', { name: 'Necesitamos el enlace completo' }),
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('status')).toContainText('Enlace incompleto');
    await expect(
      page.getByText(/pide al organizador un enlace nuevo/i),
    ).toBeVisible();
  });

  test('shows the shared upload form when QR uploads are enabled', async ({ page }) => {
    await mockSharedUploadStatus(page, MOMENT_EVENT_IDENTIFIER, {
      uploadsRemaining: 5,
    });

    await page.goto(PAGE_URL);

    await expect(page.getByRole('heading', { name: /Comparte tus momentos/ })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/Sube hasta 5 fotos o videos/)).toBeVisible();
    await expect(page.getByText(/Seleccionar/)).toBeVisible();
  });

  test('uses the backend-aligned accept policy for picker and camera inputs', async ({ page }) => {
    await mockSharedUploadStatus(page, MOMENT_EVENT_IDENTIFIER, {
      uploadsRemaining: 5,
    });

    await page.goto(PAGE_URL);
    await expect(page.getByRole('heading', { name: /Comparte tus momentos/ })).toBeVisible({ timeout: 15_000 });

    const fileInputs = page.locator('input[type="file"]');
    await expect(fileInputs).toHaveCount(2);
    await expect(fileInputs.nth(0)).toHaveAttribute('accept', /image\/heic/);
    await expect(fileInputs.nth(0)).toHaveAttribute('accept', /\.mov/);
    await expect(fileInputs.nth(1)).toHaveAttribute('accept', /image\/heic/);
    await expect(fileInputs.nth(1)).toHaveAttribute('accept', /\.mov/);
    await expect(fileInputs.nth(1)).toHaveAttribute('accept', /image\/\*/);
    await expect(fileInputs.nth(1)).toHaveAttribute('accept', /video\/\*/);
  });

  test('opens the async preview as an accessible modal and restores focus on close', async ({ page }) => {
    await mockSharedUploadStatus(page, MOMENT_EVENT_IDENTIFIER, {
      uploadsRemaining: 5,
    });

    await page.goto(PAGE_URL);
    await expect(page.getByRole('heading', { name: /Comparte tus momentos/ })).toBeVisible({ timeout: 15_000 });

    await page.locator('input[type="file"]').first().setInputFiles({
      name: 'recuerdo.jpg',
      mimeType: 'image/jpeg',
      buffer: Buffer.from('preview-image'),
    });

    const previewTrigger = page.getByRole('button', {
      name: 'Abrir vista previa de recuerdo.jpg',
    });
    await expect(previewTrigger).toBeVisible({ timeout: 10_000 });
    await previewTrigger.focus();
    await previewTrigger.click();

    const dialog = page.getByRole('dialog', { name: 'recuerdo.jpg' });
    await expect(dialog).toBeVisible();
    await expect(page.getByRole('button', { name: 'Cerrar vista previa' })).toBeFocused();
    await expect.poll(() => page.evaluate(() => document.body.style.overflow)).toBe('hidden');

    await page.keyboard.press('Escape');

    await expect(dialog).not.toBeVisible();
    await expect(previewTrigger).toBeFocused();
    await expect.poll(() => page.evaluate(() => document.body.style.overflow)).not.toBe('hidden');
  });

  test('does not autoplay video previews when reduced motion is requested', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await mockSharedUploadStatus(page, MOMENT_EVENT_IDENTIFIER, {
      uploadsRemaining: 5,
    });

    await page.goto(PAGE_URL);
    await expect(page.getByRole('heading', { name: /Comparte tus momentos/ })).toBeVisible({ timeout: 15_000 });

    await page.locator('input[type="file"]').first().setInputFiles({
      name: 'brindis.mp4',
      mimeType: 'video/mp4',
      buffer: Buffer.from('preview-video'),
    });
    await page.getByRole('button', {
      name: 'Abrir vista previa de brindis.mp4',
    }).click();

    const previewVideo = page.getByRole('dialog', { name: 'brindis.mp4' }).locator('video');
    await expect(previewVideo).toBeAttached();
    await expect(previewVideo).not.toHaveAttribute('autoplay', '');
  });

  test('keeps shared uploads open when the event is published but the moments wall is not', async ({ page }) => {
    await mockSharedUploadStatus(page, MOMENT_EVENT_IDENTIFIER, {
      eventPublished: true,
      wallPublished: false,
      uploadsRemaining: 5,
    });

    await page.goto(PAGE_URL);

    await expect(page.getByRole('heading', { name: /Comparte tus momentos/ })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/Sube hasta 5 fotos o videos/)).toBeVisible();
    await expect(page.getByRole('heading', { name: /Gracias por compartir tus mejores momentos/ })).not.toBeVisible();
  });

  test('does not show the picker when the upload status probe is rejected', async ({ page }) => {
    await mockSharedUploadStatus(page, MOMENT_EVENT_IDENTIFIER, {
      status: 403,
      message: 'Event is not public',
    });

    await page.goto(PAGE_URL);

    await expect(page.getByRole('heading', { name: /No pudimos abrir este enlace de subida/ })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/Seleccionar/)).not.toBeVisible();
  });

  test('uploads one image through batch presign, S3 PUT, and confirm', async ({ page }) => {
    let batchFileCount = 0;
    let putCalled = false;
    let confirmPayload: Record<string, unknown> | null = null;

    await mockSharedUploadStatus(page, MOMENT_EVENT_IDENTIFIER, {
      uploadsRemaining: 5,
    });
    await mockSharedBatchUploadUrls(page, MOMENT_EVENT_IDENTIFIER, {
      onBatch: (files) => {
        batchFileCount = files.length;
      },
      onPut: () => {
        putCalled = true;
      },
    });
    await mockSharedMomentConfirm(page, MOMENT_EVENT_IDENTIFIER, {
      uploadsRemaining: 0,
      onConfirm: (payload) => {
        confirmPayload = payload as Record<string, unknown>;
      },
    });

    await page.goto(PAGE_URL);
    await expect(page.getByRole('heading', { name: /Comparte tus momentos/ })).toBeVisible({ timeout: 15_000 });

    await page.locator('input[type="file"]').first().setInputFiles({
      name: 'foto.jpg',
      mimeType: 'image/jpeg',
      buffer: Buffer.from('fake-image-data'),
    });
    await expect(page.getByRole('button', { name: /Compartir momento/ })).toBeVisible({ timeout: 10_000 });

    await page.getByRole('button', { name: /Compartir momento/ }).click();

    await expect(page.getByText(/Momento compartido/)).toBeVisible({ timeout: 15_000 });
    expect(batchFileCount).toBe(1);
    expect(putCalled).toBe(true);
    expect(confirmPayload?.['object_key']).toBe(`moments/${MOMENT_EVENT_IDENTIFIER}/shared/file-0.jpg`);
    expect(confirmPayload?.['s3_key']).toBe(`moments/${MOMENT_EVENT_IDENTIFIER}/shared/file-0.jpg`);

    await page.getByRole('button', { name: /Subir más fotos o videos/ }).click();
    await expect(page.getByRole('heading', { name: /Gracias por compartir tus momentos/ })).toBeVisible({ timeout: 10_000 });
  });

  test('keeps original image MIME when client compression falls back', async ({ page }) => {
    let batchContentType = '';
    let batchFilename = '';
    let putContentType = '';
    let confirmPayload: Record<string, unknown> | null = null;

    await mockSharedUploadStatus(page, MOMENT_EVENT_IDENTIFIER, {
      uploadsRemaining: 5,
    });
    await mockSharedBatchUploadUrls(page, MOMENT_EVENT_IDENTIFIER, {
      onBatch: (files) => {
        const first = files[0] as Record<string, unknown> | undefined;
        batchContentType = String(first?.['content_type'] ?? '');
        batchFilename = String(first?.['filename'] ?? '');
      },
      onPut: (request) => {
        putContentType = request.headers()['content-type'] ?? '';
      },
    });
    await mockSharedMomentConfirm(page, MOMENT_EVENT_IDENTIFIER, {
      uploadsRemaining: 0,
      onConfirm: (payload) => {
        confirmPayload = payload as Record<string, unknown>;
      },
    });

    await page.goto(PAGE_URL);
    await expect(page.getByRole('heading', { name: /Comparte tus momentos/ })).toBeVisible({ timeout: 15_000 });

    await page.locator('input[type="file"]').first().setInputFiles({
      name: 'foto.png',
      mimeType: 'image/png',
      buffer: Buffer.from('not-a-real-image'),
    });
    await page.getByRole('button', { name: /Compartir momento/ }).click();

    await expect(page.getByText(/Momento compartido/)).toBeVisible({ timeout: 15_000 });
    expect(batchContentType).toBe('image/png');
    expect(batchFilename).toBe('foto.png');
    expect(putContentType).toContain('image/png');
    expect(confirmPayload?.['object_key']).toBe(`moments/${MOMENT_EVENT_IDENTIFIER}/shared/file-0.png`);
    expect(confirmPayload?.['content_type']).toBe('image/png');
  });

  test('shows upload limit screen when backend returns 429 with quota data', async ({ page }) => {
    await mockSharedUploadStatus(page, MOMENT_EVENT_IDENTIFIER, {
      uploadsRemaining: 1,
    });
    await mockSharedBatchUploadUrls(page, MOMENT_EVENT_IDENTIFIER, {
      status: 429,
      message: 'Gracias por compartir tus momentos. Ya registramos tus contribuciones permitidas.',
      uploadsRemaining: 0,
    });

    await page.goto(PAGE_URL);
    await expect(page.getByRole('heading', { name: /Comparte tus momentos/ })).toBeVisible({ timeout: 15_000 });

    await page.locator('input[type="file"]').first().setInputFiles({
      name: 'foto.jpg',
      mimeType: 'image/jpeg',
      buffer: Buffer.from('fake-image-data'),
    });
    await page.getByRole('button', { name: /Compartir momento/ }).click();

    await expect(page.getByRole('heading', { name: /Gracias por compartir tus momentos/ })).toBeVisible({ timeout: 15_000 });
  });

  test('shows thank-you state when the moments wall is already published', async ({ page }) => {
    await mockSharedUploadStatus(page, MOMENT_EVENT_IDENTIFIER, {
      wallPublished: true,
      shareUploadsEnabled: false,
      uploadsRemaining: 5,
      eventName: 'Boda Demo',
    });

    await page.goto(`${PAGE_URL}&event_access_token=proof%2F123`);

    await expect(page.getByRole('heading', { name: /Gracias por compartir tus mejores momentos/ })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Boda Demo')).toBeVisible();
    await expect(page.getByRole('link', { name: /Ver el muro de momentos/ })).toHaveAttribute(
      'href',
      `/e/${encodeURIComponent(MOMENT_EVENT_IDENTIFIER)}/momentos?event_access_token=proof%2F123`,
    );
  });

  test('surfaces backend message when shared confirm fails', async ({ page }) => {
    await mockSharedUploadStatus(page, MOMENT_EVENT_IDENTIFIER, {
      uploadsRemaining: 5,
    });
    await mockSharedBatchUploadUrls(page, MOMENT_EVENT_IDENTIFIER);
    await mockSharedMomentConfirm(page, MOMENT_EVENT_IDENTIFIER, {
      status: 422,
      message: 'El archivo no se pudo registrar',
    });

    await page.goto(PAGE_URL);
    await expect(page.getByRole('heading', { name: /Comparte tus momentos/ })).toBeVisible({ timeout: 15_000 });

    await page.locator('input[type="file"]').first().setInputFiles({
      name: 'foto.jpg',
      mimeType: 'image/jpeg',
      buffer: Buffer.from('fake-image-data'),
    });
    await page.getByRole('button', { name: /Compartir momento/ }).click();

    await expect(page.getByText(/El archivo no se pudo registrar/)).toBeVisible({ timeout: 15_000 });
  });
});
