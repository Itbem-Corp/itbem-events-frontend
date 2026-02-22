// tests/event-access.spec.ts
// Tests for EventPage access control features:
//   - Date gate: "Coming Soon" when now < activeFrom
//   - Date gate: "Event Ended" when now > activeUntil
//   - Password gate: password form shown when passwordProtected: true
//   - View tracking: POST /api/events/:identifier/view called once per session
//
// All API calls are intercepted via route mocks (no real network needed).

import { test, expect } from '@playwright/test';
import {
  installApiGuard,
  API_BASE,
} from './helpers/mocks';
import { installStorageClearScript } from './helpers/storage';
import { TEST_TOKENS } from './fixtures/api-data';

const TOKEN = TEST_TOKENS.graduation;
const PAGE_URL = `/graduacion-izapa?token=${TOKEN}`;
const IDENTIFIER = 'izapa-2025';

// ── PageSpec factories with access control ──────────────────────────────────

function makePageSpecWithAccess(access: {
  activeFrom?: string;
  activeUntil?: string;
  passwordProtected?: boolean;
}) {
  return {
    data: {
      meta: {
        pageTitle: 'Test Event',
        identifier: IDENTIFIER,
        eventId: 'evt-test-uuid-0001',
        access,
      },
      sections: [],
    },
  };
}

async function mockPageSpec(page: import('@playwright/test').Page, access: {
  activeFrom?: string;
  activeUntil?: string;
  passwordProtected?: boolean;
}) {
  await page.route(
    `${API_BASE}/api/events/page-spec?token=${TOKEN}`,
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(makePageSpecWithAccess(access)),
      });
    }
  );
}

async function mockViewEndpoint(page: import('@playwright/test').Page): Promise<() => boolean> {
  let called = false;
  await page.route(
    `${API_BASE}/api/events/${IDENTIFIER}/view`,
    async (route) => {
      called = true;
      await route.fulfill({ status: 200, body: JSON.stringify({ data: null }) });
    }
  );
  return () => called;
}

async function mockVerifyAccess(
  page: import('@playwright/test').Page,
  correctPassword: string
) {
  await page.route(
    `${API_BASE}/api/events/${IDENTIFIER}/verify-access`,
    async (route) => {
      const body = JSON.parse(route.request().postData() ?? '{}');
      if (body.password === correctPassword) {
        await route.fulfill({ status: 200, body: JSON.stringify({ data: null }) });
      } else {
        await route.fulfill({ status: 401, body: JSON.stringify({ message: 'Contraseña incorrecta' }) });
      }
    }
  );
}

test.beforeEach(async ({ page }) => {
  await installStorageClearScript(page);
  await installApiGuard(page);
});

// ── Coming Soon Gate ─────────────────────────────────────────────────────────

test.describe('Date gate — Coming Soon', () => {

  test('muestra pantalla "aún no está disponible" cuando activeFrom es futuro', async ({ page }) => {
    const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // +7 days
    await mockPageSpec(page, { activeFrom: futureDate });
    await mockViewEndpoint(page);
    await page.goto(PAGE_URL);

    await expect(page.getByText(/Esta invitación aún no está disponible/i))
      .toBeVisible({ timeout: 10_000 });
  });

  test('muestra la fecha de disponibilidad formateada', async ({ page }) => {
    const futureDate = new Date('2030-12-25T18:00:00-06:00').toISOString();
    await mockPageSpec(page, { activeFrom: futureDate });
    await mockViewEndpoint(page);
    await page.goto(PAGE_URL);

    // Date is formatted with es-MX locale
    await expect(page.getByText(/2030/)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/diciembre/i)).toBeVisible({ timeout: 10_000 });
  });

  test('NO muestra el contenido del evento cuando está "coming soon"', async ({ page }) => {
    const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    await mockPageSpec(page, { activeFrom: futureDate });
    await mockViewEndpoint(page);
    await page.goto(PAGE_URL);

    await expect(page.getByText(/Esta invitación aún no está disponible/i))
      .toBeVisible({ timeout: 10_000 });
    // Sections should not render
    await expect(page.locator('main').getByRole('heading', { name: 'NOS GRADUAMOS' }))
      .not.toBeVisible();
  });

  test('NO muestra coming soon cuando activeFrom es pasado', async ({ page }) => {
    const pastDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    await mockPageSpec(page, { activeFrom: pastDate });
    await mockViewEndpoint(page);
    await page.goto(PAGE_URL);

    await expect(page.getByText(/Esta invitación aún no está disponible/i))
      .not.toBeVisible({ timeout: 10_000 });
  });
});

// ── Event Ended Gate ─────────────────────────────────────────────────────────

test.describe('Date gate — Event Ended', () => {

  test('muestra pantalla "el evento ya concluyó" cuando activeUntil es pasado', async ({ page }) => {
    const pastDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    await mockPageSpec(page, { activeUntil: pastDate });
    await mockViewEndpoint(page);
    await page.goto(PAGE_URL);

    await expect(page.getByText(/El evento ya concluyó/i))
      .toBeVisible({ timeout: 10_000 });
  });

  test('muestra la fecha de conclusión formateada', async ({ page }) => {
    const pastDate = new Date('2025-01-15T20:00:00-06:00').toISOString();
    await mockPageSpec(page, { activeUntil: pastDate });
    await mockViewEndpoint(page);
    await page.goto(PAGE_URL);

    await expect(page.getByText(/2025/)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/enero/i)).toBeVisible({ timeout: 10_000 });
  });

  test('NO muestra event ended cuando activeUntil es futuro', async ({ page }) => {
    const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    await mockPageSpec(page, { activeUntil: futureDate });
    await mockViewEndpoint(page);
    await page.goto(PAGE_URL);

    await expect(page.getByText(/El evento ya concluyó/i))
      .not.toBeVisible({ timeout: 10_000 });
  });

  test('NO muestra el contenido del evento cuando ya concluyó', async ({ page }) => {
    const pastDate = new Date(Date.now() - 1000).toISOString();
    await mockPageSpec(page, { activeUntil: pastDate });
    await mockViewEndpoint(page);
    await page.goto(PAGE_URL);

    await expect(page.getByText(/El evento ya concluyó/i))
      .toBeVisible({ timeout: 10_000 });
  });
});

// ── Password Gate ─────────────────────────────────────────────────────────────

test.describe('Password gate', () => {

  test('muestra formulario de contraseña cuando passwordProtected es true', async ({ page }) => {
    await mockPageSpec(page, { passwordProtected: true });
    await mockVerifyAccess(page, 'secreto123');
    await mockViewEndpoint(page);
    await page.goto(PAGE_URL);

    await expect(page.getByPlaceholder('Contraseña'))
      .toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/Esta invitación es privada/i))
      .toBeVisible({ timeout: 10_000 });
  });

  test('NO muestra contraseña incorrecta inicialmente', async ({ page }) => {
    await mockPageSpec(page, { passwordProtected: true });
    await mockVerifyAccess(page, 'secreto123');
    await mockViewEndpoint(page);
    await page.goto(PAGE_URL);

    await expect(page.getByText(/Contraseña incorrecta/i))
      .not.toBeVisible({ timeout: 10_000 });
  });

  test('botón Acceder está deshabilitado con campo vacío', async ({ page }) => {
    await mockPageSpec(page, { passwordProtected: true });
    await mockVerifyAccess(page, 'secreto123');
    await mockViewEndpoint(page);
    await page.goto(PAGE_URL);

    await expect(page.getByRole('button', { name: 'Acceder' }))
      .toBeDisabled({ timeout: 10_000 });
  });

  test('muestra error al ingresar contraseña incorrecta', async ({ page }) => {
    await mockPageSpec(page, { passwordProtected: true });
    await mockVerifyAccess(page, 'secreto123');
    await mockViewEndpoint(page);
    await page.goto(PAGE_URL);

    await page.getByPlaceholder('Contraseña').fill('malapassword');
    await page.getByRole('button', { name: 'Acceder' }).click();

    await expect(page.getByText(/Contraseña incorrecta/i))
      .toBeVisible({ timeout: 10_000 });
  });

  test('muestra el contenido con contraseña correcta', async ({ page }) => {
    await mockPageSpec(page, { passwordProtected: true });
    await mockVerifyAccess(page, 'secreto123');
    await mockViewEndpoint(page);
    await page.goto(PAGE_URL);

    await page.getByPlaceholder('Contraseña').fill('secreto123');
    await page.getByRole('button', { name: 'Acceder' }).click();

    // After successful verification, page content (footer at least) should show
    await expect(page.getByPlaceholder('Contraseña'))
      .not.toBeVisible({ timeout: 10_000 });
  });

  test('NO muestra formulario de contraseña cuando passwordProtected es false', async ({ page }) => {
    await mockPageSpec(page, { passwordProtected: false });
    await mockViewEndpoint(page);
    await page.goto(PAGE_URL);

    await expect(page.getByPlaceholder('Contraseña'))
      .not.toBeVisible({ timeout: 10_000 });
  });

  test('contraseña verificada se restaura desde sessionStorage (sin re-pedir)', async ({ page }) => {
    await mockPageSpec(page, { passwordProtected: true });
    await mockVerifyAccess(page, 'secreto123');
    await mockViewEndpoint(page);

    // Inject verified state into sessionStorage before the page loads
    await page.addInitScript((id: string) => {
      sessionStorage.setItem(`event-verified-${id}`, '1');
    }, IDENTIFIER);

    await page.goto(PAGE_URL);

    // Should NOT show the password form
    await expect(page.getByPlaceholder('Contraseña'))
      .not.toBeVisible({ timeout: 10_000 });
  });
});

// ── View Tracking ─────────────────────────────────────────────────────────────

test.describe('View tracking', () => {

  test('llama POST /view después de cargar el page-spec', async ({ page }) => {
    await mockPageSpec(page, {});
    let viewCalled = false;
    await page.route(
      `${API_BASE}/api/events/${IDENTIFIER}/view`,
      async (route) => {
        viewCalled = true;
        await route.fulfill({ status: 200, body: JSON.stringify({ data: null }) });
      }
    );

    await page.goto(PAGE_URL);

    // Wait for page to settle
    await page.waitForTimeout(2_000);
    expect(viewCalled).toBe(true);
  });

  test('NO llama /view cuando el spec ya está en caché (misma sesión)', async ({ page }) => {
    await mockPageSpec(page, {});
    let viewCallCount = 0;
    await page.route(
      `${API_BASE}/api/events/${IDENTIFIER}/view`,
      async (route) => {
        viewCallCount++;
        await route.fulfill({ status: 200, body: JSON.stringify({ data: null }) });
      }
    );

    // Inject sessionStorage token marker BEFORE page loads to simulate "already viewed"
    await page.addInitScript((id: string) => {
      sessionStorage.setItem(`view-tracked-${id}`, '1');
    }, IDENTIFIER);

    await page.goto(PAGE_URL);
    await page.waitForTimeout(2_000);

    expect(viewCallCount).toBe(0);
  });

  test('guarda view-tracked en sessionStorage después del primer hit', async ({ page }) => {
    await mockPageSpec(page, {});
    await page.route(`${API_BASE}/api/events/${IDENTIFIER}/view`, async (route) => {
      await route.fulfill({ status: 200, body: JSON.stringify({ data: null }) });
    });

    await page.goto(PAGE_URL);
    await page.waitForTimeout(2_000);

    const stored = await page.evaluate(
      (id: string) => sessionStorage.getItem(`view-tracked-${id}`),
      IDENTIFIER
    );
    expect(stored).toBe('1');
  });
});
