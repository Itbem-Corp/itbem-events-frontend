// tests/wedding-rsvp.spec.ts
// Tests para /AndresIvanna/Confirmacion — flujo RSVP de boda.
// Cubre: carga de invitación, selección yes/no, submit, estados previos, errores.

import { test, expect } from '@playwright/test';
import {
  mockWeddingPageSpec,
  mockWeddingResources,
  mockInvitation,
  mockRsvpPost,
  installApiGuard,
  API_BASE,
} from './helpers/mocks';
import { installStorageClearScript } from './helpers/storage';

const TOKEN = 'test-token-abc';
const PAGE_URL = `/AndresIvanna/Confirmacion?token=${TOKEN}`;

// Setup base: limpiar caché + guard primero + recursos de sección.
// Guard registrado PRIMERO (menor prioridad) — mocks específicos registrados
// después lo sobreescriben (Playwright es LIFO: último registrado gana).
test.beforeEach(async ({ page }) => {
  await installStorageClearScript(page);
  await installApiGuard(page);
  await mockWeddingPageSpec(page);
  await mockWeddingResources(page);
});

// ---------------------------------------------------------------------------
// Carga de invitación
// ---------------------------------------------------------------------------
test.describe('Carga de invitación', () => {

  test('muestra "Cargando..." mientras llegan los datos', async ({ page }) => {
    // Delayar la respuesta para observar el estado de carga
    await page.route(`${API_BASE}/api/invitations/ByToken/${TOKEN}`, async (route) => {
      await new Promise((r) => setTimeout(r, 1500));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            pretty_token: 'ABC-123',
            invitation: { ID: '1', EventID: '1', max_guests: 2, Event: { EventDateTime: '2026-08-15T20:30:00-06:00' } },
            guest: { first_name: 'Ana', last_name: 'García', rsvp_status: '' },
          },
        }),
      });
    });
    await page.goto(PAGE_URL);
    await expect(page.getByText('Cargando...')).toBeVisible({ timeout: 5_000 });
  });

  test('muestra el nombre del invitado al cargar', async ({ page }) => {
    await mockInvitation(page, '', TOKEN);
    await page.goto(PAGE_URL);
    await expect(page.getByRole('heading', { name: 'Ana García' })).toBeVisible({ timeout: 10_000 });
  });

  test('muestra el número máximo de personas', async ({ page }) => {
    await mockInvitation(page, '', TOKEN);
    await page.goto(PAGE_URL);
    // makeInvitationResponse devuelve maxGuests: 3
    await expect(page.getByText(/No\. personas:/).first()).toBeVisible({ timeout: 10_000 });
  });

  test('muestra la pregunta "¿Nos acompañas?"', async ({ page }) => {
    await mockInvitation(page, '', TOKEN);
    await page.goto(PAGE_URL);
    await expect(page.getByRole('heading', { name: '¿Nos acompañas?' })).toBeVisible({ timeout: 10_000 });
  });

  test('muestra error cuando el token no existe (API 404)', async ({ page }) => {
    await page.route(`${API_BASE}/api/invitations/ByToken/${TOKEN}`, async (route) => {
      await route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Invitación no encontrada' }),
      });
    });
    await page.goto(PAGE_URL);
    // InvitationDataLoader llama onError → Section1Wrapper renderiza <p class="text-red-600">
    await expect(page.locator('.text-red-600')).toBeVisible({ timeout: 10_000 });
  });

  test('sin token en URL muestra error "Token requerido"', async ({ page }) => {
    await page.goto('/AndresIvanna/Confirmacion');
    // EventPage lee ?token= de la URL; sin token muestra mensaje de error.
    await expect(page.getByText(/Token requerido/i)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('heading', { name: 'Ana García' })).not.toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Flujo YES — confirmar asistencia
// ---------------------------------------------------------------------------
test.describe('Flujo de confirmación (Yes)', () => {

  test.beforeEach(async ({ page }) => {
    await mockInvitation(page, '', TOKEN);
    await mockRsvpPost(page, { success: true });
    await page.goto(PAGE_URL);
    await expect(page.getByRole('heading', { name: 'Ana García' })).toBeVisible({ timeout: 10_000 });
  });

  test('botón "Claro, con gusto" es visible', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Claro, con gusto' })).toBeVisible();
  });

  test('"Enviar" está deshabilitado antes de seleccionar respuesta', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Enviar' })).toBeDisabled();
  });

  test('seleccionar yes muestra selector de número de personas', async ({ page }) => {
    await page.getByRole('button', { name: 'Claro, con gusto' }).click();
    // .first() excluye el <select name="dev-toolbar-select"> del dev toolbar de Astro
    await expect(page.locator('select').first()).toBeVisible({ timeout: 5_000 });
  });

  test('selector de personas tiene opciones 1, 2, 3 (maxGuests = 3)', async ({ page }) => {
    await page.getByRole('button', { name: 'Claro, con gusto' }).click();
    const options = await page.locator('select').first().locator('option').allTextContents();
    expect(options).toEqual(['1', '2', '3']);
  });

  test('"Enviar" se habilita después de seleccionar yes', async ({ page }) => {
    await page.getByRole('button', { name: 'Claro, con gusto' }).click();
    await expect(page.getByRole('button', { name: 'Enviar' })).toBeEnabled({ timeout: 5_000 });
  });

  test('submit envía payload correcto al backend', async ({ page }) => {
    let capturedBody: Record<string, unknown> = {};
    await page.unroute(`${API_BASE}/api/invitations/rsvp`);
    await page.route(`${API_BASE}/api/invitations/rsvp`, async (route) => {
      capturedBody = JSON.parse(route.request().postData() ?? '{}');
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { message: 'ok' } }) });
    });

    await page.getByRole('button', { name: 'Claro, con gusto' }).click();
    await page.locator('select').first().selectOption('2');
    await page.getByRole('button', { name: 'Enviar' }).click();
    await page.waitForTimeout(1_000);

    expect(capturedBody).toMatchObject({
      pretty_token: 'ABC-123',
      status: 'confirmed',
      method: 'web',
      guest_count: 2,
    });
  });

  test('confirmación exitosa muestra mensaje de éxito', async ({ page }) => {
    await page.getByRole('button', { name: 'Claro, con gusto' }).click();
    await page.getByRole('button', { name: 'Enviar' }).click();
    await expect(page.getByText(/Gracias por confirmar tu asistencia/)).toBeVisible({ timeout: 10_000 });
  });

  test('mensaje de éxito incluye la fecha del evento formateada', async ({ page }) => {
    await page.getByRole('button', { name: 'Claro, con gusto' }).click();
    await page.getByRole('button', { name: 'Enviar' }).click();
    // eventDate = '2026-08-15T20:30:00-06:00' → "15 de agosto de 2026" en es-MX
    await expect(page.getByText(/15 de agosto de 2026/)).toBeVisible({ timeout: 10_000 });
  });

  test('"Enviar" muestra "Enviando..." mientras procesa', async ({ page }) => {
    await page.unroute(`${API_BASE}/api/invitations/rsvp`);
    await page.route(`${API_BASE}/api/invitations/rsvp`, async (route) => {
      await new Promise((r) => setTimeout(r, 2_000));
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: {} }) });
    });

    await page.getByRole('button', { name: 'Claro, con gusto' }).click();
    await page.getByRole('button', { name: 'Enviar' }).click();
    await expect(page.getByRole('button', { name: 'Enviando...' })).toBeVisible({ timeout: 3_000 });
    await expect(page.getByRole('button', { name: 'Enviando...' })).toBeDisabled();
  });
});

// ---------------------------------------------------------------------------
// Flujo NO — declinar asistencia
// ---------------------------------------------------------------------------
test.describe('Flujo de declinación (No)', () => {

  test.beforeEach(async ({ page }) => {
    await mockInvitation(page, '', TOKEN);
    await mockRsvpPost(page, { success: true });
    await page.goto(PAGE_URL);
    await expect(page.getByRole('heading', { name: 'Ana García' })).toBeVisible({ timeout: 10_000 });
  });

  test('"No podré esta vez" es visible', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'No podré esta vez' })).toBeVisible();
  });

  test('seleccionar no NO muestra selector de personas', async ({ page }) => {
    await page.getByRole('button', { name: 'No podré esta vez' }).click();
    await expect(page.locator('select')).not.toBeVisible();
  });

  test('declinar envía status "declined" y guest_count 0', async ({ page }) => {
    let capturedBody: Record<string, unknown> = {};
    await page.unroute(`${API_BASE}/api/invitations/rsvp`);
    await page.route(`${API_BASE}/api/invitations/rsvp`, async (route) => {
      capturedBody = JSON.parse(route.request().postData() ?? '{}');
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: {} }) });
    });

    await page.getByRole('button', { name: 'No podré esta vez' }).click();
    await page.getByRole('button', { name: 'Enviar' }).click();
    await page.waitForTimeout(1_000);

    expect(capturedBody).toMatchObject({ status: 'declined', guest_count: 0 });
  });

  test('declinar muestra mensaje "Lamentamos que no nos puedas acompañar"', async ({ page }) => {
    await page.getByRole('button', { name: 'No podré esta vez' }).click();
    await page.getByRole('button', { name: 'Enviar' }).click();
    await expect(page.getByText(/Lamentamos que no nos puedas acompañar/)).toBeVisible({ timeout: 10_000 });
  });
});

// ---------------------------------------------------------------------------
// Estados previos (ya confirmado / ya declinado en backend)
// ---------------------------------------------------------------------------
test.describe('Estados RSVP previos', () => {

  test('invitado ya confirmado ve su confirmación inmediatamente', async ({ page }) => {
    await mockInvitation(page, 'confirmed', TOKEN);
    await page.goto(PAGE_URL);
    await expect(page.getByText(/Gracias por confirmar tu asistencia/)).toBeVisible({ timeout: 10_000 });
  });

  test('invitado confirmado ve botón "Cancelar mi confirmación"', async ({ page }) => {
    await mockInvitation(page, 'confirmed', TOKEN);
    await page.goto(PAGE_URL);
    await expect(page.getByRole('button', { name: 'Cancelar mi confirmación' })).toBeVisible({ timeout: 10_000 });
  });

  test('cancelar envía POST con status "declined"', async ({ page }) => {
    await mockInvitation(page, 'confirmed', TOKEN);
    let capturedBody: Record<string, unknown> = {};
    await page.route(`${API_BASE}/api/invitations/rsvp`, async (route) => {
      capturedBody = JSON.parse(route.request().postData() ?? '{}');
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: {} }) });
    });
    await page.goto(PAGE_URL);

    await expect(page.getByRole('button', { name: 'Cancelar mi confirmación' })).toBeVisible({ timeout: 10_000 });
    await page.getByRole('button', { name: 'Cancelar mi confirmación' }).click();
    await page.waitForTimeout(1_000);

    expect(capturedBody).toMatchObject({ status: 'declined', guest_count: 0 });
  });

  test('después de cancelar, la UI cambia a estado de declinado sin recargar', async ({ page }) => {
    await mockInvitation(page, 'confirmed', TOKEN);
    await page.route(`${API_BASE}/api/invitations/rsvp`, async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: {} }) });
    });
    await page.goto(PAGE_URL);

    await expect(page.getByRole('button', { name: 'Cancelar mi confirmación' })).toBeVisible({ timeout: 10_000 });
    await page.getByRole('button', { name: 'Cancelar mi confirmación' }).click();

    // handleCancel: setInvData(prev => { ...prev, rsvpStatus: "declined" }) — sin reload
    await expect(page.getByText(/Lamentamos que no nos puedas acompañar/)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/Gracias por confirmar tu asistencia/)).not.toBeVisible();
  });

  test('invitado ya declinado ve mensaje de declinación inmediatamente', async ({ page }) => {
    await mockInvitation(page, 'declined', TOKEN);
    await page.goto(PAGE_URL);
    await expect(page.getByText(/Lamentamos que no nos puedas acompañar/)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('button', { name: 'Claro, con gusto' })).not.toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Manejo de errores
// ---------------------------------------------------------------------------
test.describe('Manejo de errores en RSVP', () => {

  test('error en POST muestra mensaje de error en UI', async ({ page }) => {
    await mockInvitation(page, '', TOKEN);
    await mockRsvpPost(page, { success: false, errorMessage: 'Token inválido' });
    await page.goto(PAGE_URL);

    await expect(page.getByRole('heading', { name: 'Ana García' })).toBeVisible({ timeout: 10_000 });
    await page.getByRole('button', { name: 'Claro, con gusto' }).click();
    await page.getByRole('button', { name: 'Enviar' }).click();

    await expect(page.getByText(/Error: Token inválido/)).toBeVisible({ timeout: 10_000 });
  });

  test('error de red en POST muestra mensaje de error genérico', async ({ page }) => {
    await mockInvitation(page, '', TOKEN);
    await page.route(`${API_BASE}/api/invitations/rsvp`, async (route) => {
      await route.abort('connectionfailed');
    });
    await page.goto(PAGE_URL);

    await expect(page.getByRole('heading', { name: 'Ana García' })).toBeVisible({ timeout: 10_000 });
    await page.getByRole('button', { name: 'Claro, con gusto' }).click();
    await page.getByRole('button', { name: 'Enviar' }).click();

    await expect(page.getByText(/Error:/)).toBeVisible({ timeout: 10_000 });
  });
});

// ---------------------------------------------------------------------------
// Responsive
// ---------------------------------------------------------------------------
test.describe('Responsive', () => {

  test('formulario RSVP es usable en viewport mobile', async ({ page }) => {
    await mockInvitation(page, '', TOKEN);
    await mockRsvpPost(page, { success: true });
    await page.goto(PAGE_URL);

    await expect(page.getByRole('heading', { name: 'Ana García' })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('button', { name: 'Claro, con gusto' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'No podré esta vez' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Enviar' })).toBeVisible();
  });

  test('botones RSVP no se salen del viewport', async ({ page }) => {
    await mockInvitation(page, '', TOKEN);
    await page.goto(PAGE_URL);

    const btn = page.getByRole('button', { name: 'Claro, con gusto' });
    await expect(btn).toBeVisible({ timeout: 10_000 });
    const box = await btn.boundingBox();
    const viewport = page.viewportSize();
    if (box && viewport) {
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 2);
    }
  });
});
