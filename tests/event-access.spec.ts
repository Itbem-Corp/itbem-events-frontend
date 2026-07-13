// tests/event-access.spec.ts
// Tests for EventPage access control features:
//   - Date gate: "Coming Soon" when now < activeFrom
//   - Date gate: "Event Ended" when now > activeUntil
//   - Password gate: password form shown when passwordProtected: true
//   - View tracking: POST /api/events/:identifier/view called once per session
//
// All API calls are intercepted via route mocks (no real network needed).

import { test, expect } from "@playwright/test";
import { installApiGuard, API_BASE, mockS3Images } from "./helpers/mocks";
import { installStorageClearScript } from "./helpers/storage";
import {
  makeSectionResponse,
  SECTION_IDS,
  TEST_GRADUATION_ATTENDEES,
  TEST_TOKENS,
} from "./fixtures/api-data";
import { passwordVerificationSessionKey } from "../src/lib/accessSessionKeys";
import { viewTrackingSessionKey } from "../src/lib/eventTrackingUrl";

const TOKEN = TEST_TOKENS.graduation;
const PAGE_URL = `/graduacion-izapa?token=${TOKEN}`;
const IDENTIFIER = "izapa-2025";
const IDENTIFIER_PAGE_URL = `/e/${IDENTIFIER}`;
const ACCESS_VERSION = "2026-07-08T00:00:00Z";
const PASSWORD_VERIFICATION_KEY = passwordVerificationSessionKey(
  API_BASE,
  IDENTIFIER,
  ACCESS_VERSION,
  TOKEN,
);
const UNVERSIONED_PASSWORD_VERIFICATION_KEY = passwordVerificationSessionKey(
  API_BASE,
  IDENTIFIER,
  undefined,
  TOKEN,
);
const SATELLITE_PASSWORD_VERIFICATION_KEY = passwordVerificationSessionKey(
  API_BASE,
  IDENTIFIER,
  ACCESS_VERSION,
);
const VIEW_TRACKING_KEY = viewTrackingSessionKey(API_BASE, IDENTIFIER, TOKEN);

// ── PageSpec factories with access control ──────────────────────────────────

function makePageSpecWithAccess(access: {
  activeFrom?: string;
  activeUntil?: string;
  passwordProtected?: boolean;
  previewAuthorized?: boolean;
  passwordVerified?: boolean;
  accessVersion?: string;
}) {
  return {
    data: {
      meta: {
        pageTitle: "Test Event",
        identifier: IDENTIFIER,
        eventId: "evt-test-uuid-0001",
        access,
      },
      sections: [],
    },
  };
}

async function mockPageSpec(
  page: import("@playwright/test").Page,
  access: {
    activeFrom?: string;
    activeUntil?: string;
    passwordProtected?: boolean;
    previewAuthorized?: boolean;
    passwordVerified?: boolean;
    accessVersion?: string;
  },
) {
  await page.route(
    `${API_BASE}/api/events/page-spec?token=${TOKEN}`,
    async (route) => {
      const accessProof = route.request().headers()["x-event-access-token"];
      const effectiveAccess = accessProof
        ? { ...access, passwordVerified: true }
        : access;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(makePageSpecWithAccess(effectiveAccess)),
      });
    },
  );
}

async function mockIdentifierPageSpec(
  page: import("@playwright/test").Page,
  access: {
    activeFrom?: string;
    activeUntil?: string;
    passwordProtected?: boolean;
    previewAuthorized?: boolean;
    passwordVerified?: boolean;
    accessVersion?: string;
  },
) {
  await page.route(
    `${API_BASE}/api/events/${IDENTIFIER}/page-spec**`,
    async (route) => {
      const accessProof = route.request().headers()["x-event-access-token"];
      const effectiveAccess = accessProof
        ? { ...access, passwordVerified: true }
        : access;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(makePageSpecWithAccess(effectiveAccess)),
      });
    },
  );
}

async function mockViewEndpoint(
  page: import("@playwright/test").Page,
): Promise<() => boolean> {
  let called = false;
  await page.route(
    `${API_BASE}/api/events/${IDENTIFIER}/view**`,
    async (route) => {
      called = true;
      await route.fulfill({
        status: 200,
        body: JSON.stringify({ data: null }),
      });
    },
  );
  return () => called;
}

async function mockVerifyAccess(
  page: import("@playwright/test").Page,
  correctPassword: string,
) {
  await page.route(
    `${API_BASE}/api/events/${IDENTIFIER}/verify-access**`,
    async (route) => {
      const body = JSON.parse(route.request().postData() ?? "{}");
      if (body.password === correctPassword) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            status: 200,
            message: "Access granted",
            data: {
              passwordProtected: true,
              accessToken: "test-access-proof",
              accessTokenType: "event_password",
              accessVersion: ACCESS_VERSION,
            },
          }),
        });
      } else {
        await route.fulfill({
          status: 401,
          body: JSON.stringify({ message: "Contraseña incorrecta" }),
        });
      }
    },
  );
}

test.beforeEach(async ({ page }) => {
  await installStorageClearScript(page);
  await installApiGuard(page);
});

// ── Coming Soon Gate ─────────────────────────────────────────────────────────

test.describe("Page-spec API errors", () => {
  test("localiza el 403 permanente sin ofrecer un reintento inútil", async ({
    page,
  }) => {
    let calls = 0;
    await page.route(
      `${API_BASE}/api/events/page-spec?token=${TOKEN}`,
      async (route) => {
        calls++;
        await route.fulfill({
          status: 403,
          contentType: "application/json",
          body: JSON.stringify({
            status: 403,
            message: "Event is not public",
            error: "forbidden",
          }),
        });
      },
    );

    await page.goto(PAGE_URL);

    await expect(
      page.getByText("Esta invitación no está disponible"),
    ).toBeVisible({ timeout: 10_000 });
    await expect(
      page.getByRole("button", { name: "Reintentar" }),
    ).not.toBeVisible();
    expect(calls).toBe(1);
  });

  test("reintenta errores temporales y muestra el ultimo mensaje backend", async ({
    page,
  }) => {
    let calls = 0;
    await page.route(
      `${API_BASE}/api/events/page-spec?token=${TOKEN}`,
      async (route) => {
        calls++;
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({
            status: 500,
            message: "Error cargando page-spec",
            error: "temporary_failure",
          }),
        });
      },
    );

    await page.goto(PAGE_URL);

    await expect(page.getByText("Error cargando page-spec")).toBeVisible({
      timeout: 10_000,
    });
    expect(calls).toBe(3);
  });
});

test("proof expirado en sessionStorage se limpia y vuelve a pedir contraseÃ±a", async ({
  page,
}) => {
  let calls = 0;
  const proofHeaders: string[] = [];
  await page.route(
    `${API_BASE}/api/events/page-spec?token=${TOKEN}`,
    async (route) => {
      calls++;
      proofHeaders.push(
        route.request().headers()["x-event-access-token"] ?? "",
      );
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          makePageSpecWithAccess({
            passwordProtected: true,
            accessVersion: ACCESS_VERSION,
          }),
        ),
      });
    },
  );
  await mockVerifyAccess(page, "secreto123");
  await mockViewEndpoint(page);

  await page.addInitScript((key: string) => {
    sessionStorage.setItem(key, "expired-proof");
  }, PASSWORD_VERIFICATION_KEY);

  await page.goto(PAGE_URL);

  await expect(page.getByRole("textbox")).toBeVisible({ timeout: 10_000 });
  await expect
    .poll(() => proofHeaders.includes("expired-proof"), { timeout: 5_000 })
    .toBe(true);
  await expect
    .poll(
      () =>
        page.evaluate(
          (key: string) => sessionStorage.getItem(key),
          PASSWORD_VERIFICATION_KEY,
        ),
      { timeout: 5_000 },
    )
    .toBeNull();
  const callsAfterCleanup = calls;
  await page.waitForTimeout(300);
  expect(calls).toBe(callsAfterCleanup);
});

test.describe("Date gate — Coming Soon", () => {
  test('muestra pantalla "aún no está disponible" cuando activeFrom es futuro', async ({
    page,
  }) => {
    const futureDate = new Date(
      Date.now() + 7 * 24 * 60 * 60 * 1000,
    ).toISOString(); // +7 days
    await mockPageSpec(page, { activeFrom: futureDate });
    await mockViewEndpoint(page);
    await page.goto(PAGE_URL);

    await expect(
      page.getByText(/Esta invitación aún no está disponible/i),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("muestra la fecha de disponibilidad formateada", async ({ page }) => {
    const futureDate = new Date("2030-12-25T18:00:00-06:00").toISOString();
    await mockPageSpec(page, { activeFrom: futureDate });
    await mockViewEndpoint(page);
    await page.goto(PAGE_URL);

    // Date is formatted with es-MX locale
    await expect(page.getByText(/2030/)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/diciembre/i)).toBeVisible({ timeout: 10_000 });
  });

  test('NO muestra el contenido del evento cuando está "coming soon"', async ({
    page,
  }) => {
    const futureDate = new Date(
      Date.now() + 7 * 24 * 60 * 60 * 1000,
    ).toISOString();
    await mockPageSpec(page, { activeFrom: futureDate });
    await mockViewEndpoint(page);
    await page.goto(PAGE_URL);

    await expect(
      page.getByText(/Esta invitación aún no está disponible/i),
    ).toBeVisible({ timeout: 10_000 });
    // Sections should not render
    await expect(
      page.locator("main").getByRole("heading", { name: "NOS GRADUAMOS" }),
    ).not.toBeVisible();
  });

  test("NO muestra coming soon cuando activeFrom es pasado", async ({
    page,
  }) => {
    const pastDate = new Date(
      Date.now() - 7 * 24 * 60 * 60 * 1000,
    ).toISOString();
    await mockPageSpec(page, { activeFrom: pastDate });
    await mockViewEndpoint(page);
    await page.goto(PAGE_URL);

    await expect(
      page.getByText(/Esta invitación aún no está disponible/i),
    ).not.toBeVisible({ timeout: 10_000 });
  });
});

// ── Event Ended Gate ─────────────────────────────────────────────────────────

test.describe("Date gate — Event Ended", () => {
  test('muestra pantalla "el evento ya concluyó" cuando activeUntil es pasado', async ({
    page,
  }) => {
    const pastDate = new Date(
      Date.now() - 7 * 24 * 60 * 60 * 1000,
    ).toISOString();
    await mockPageSpec(page, { activeUntil: pastDate });
    await mockViewEndpoint(page);
    await page.goto(PAGE_URL);

    await expect(page.getByText(/El evento ya concluyó/i)).toBeVisible({
      timeout: 10_000,
    });
  });

  test("muestra la fecha de conclusión formateada", async ({ page }) => {
    const pastDate = new Date("2025-01-15T20:00:00-06:00").toISOString();
    await mockPageSpec(page, { activeUntil: pastDate });
    await mockViewEndpoint(page);
    await page.goto(PAGE_URL);

    await expect(page.getByText(/2025/)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/enero/i)).toBeVisible({ timeout: 10_000 });
  });

  test("NO muestra event ended cuando activeUntil es futuro", async ({
    page,
  }) => {
    const futureDate = new Date(
      Date.now() + 7 * 24 * 60 * 60 * 1000,
    ).toISOString();
    await mockPageSpec(page, { activeUntil: futureDate });
    await mockViewEndpoint(page);
    await page.goto(PAGE_URL);

    await expect(page.getByText(/El evento ya concluyó/i)).not.toBeVisible({
      timeout: 10_000,
    });
  });

  test("NO muestra el contenido del evento cuando ya concluyó", async ({
    page,
  }) => {
    const pastDate = new Date(Date.now() - 1000).toISOString();
    await mockPageSpec(page, { activeUntil: pastDate });
    await mockViewEndpoint(page);
    await page.goto(PAGE_URL);

    await expect(page.getByText(/El evento ya concluyó/i)).toBeVisible({
      timeout: 10_000,
    });
  });
});

// ── Password Gate ─────────────────────────────────────────────────────────────

test.describe("Password gate", () => {
  test("ofrece entrada accesible, revelado seguro y recuperacion de error", async ({
    page,
  }) => {
    await mockPageSpec(page, { passwordProtected: true });
    await mockVerifyAccess(page, "secreto123");
    await mockViewEndpoint(page);
    await page.goto(PAGE_URL);

    const passwordInput = page.getByLabel("Contraseña del evento");
    await expect(passwordInput).toBeVisible({ timeout: 10_000 });
    await expect(passwordInput).toHaveAttribute("type", "password");

    await page.getByRole("button", { name: "Mostrar contraseña" }).click();
    await expect(passwordInput).toHaveAttribute("type", "text");
    await expect(
      page.getByRole("button", { name: "Ocultar contraseña" }),
    ).toHaveAttribute("aria-pressed", "true");

    await passwordInput.fill("incorrecta");
    await page.getByRole("button", { name: "Acceder" }).click();

    await expect(page.getByRole("alert")).toContainText(
      "Contraseña incorrecta",
      { timeout: 10_000 },
    );
    await expect(passwordInput).toHaveAttribute("aria-invalid", "true");
    await expect(passwordInput).toBeFocused();

    await passwordInput.fill("secreto123");
    await expect(page.getByRole("alert")).not.toBeVisible();
    await expect(passwordInput).toHaveAttribute("aria-invalid", "false");
  });

  test("comunica la verificacion asincrona y evita envios duplicados", async ({
    page,
  }) => {
    await mockPageSpec(page, { passwordProtected: true });
    await mockViewEndpoint(page);

    let verifyCalls = 0;
    let releaseVerification: () => void = () => {};
    const verificationPending = new Promise<void>((resolve) => {
      releaseVerification = resolve;
    });
    await page.route(
      `${API_BASE}/api/events/${IDENTIFIER}/verify-access**`,
      async (route) => {
        verifyCalls++;
        await verificationPending;
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            data: {
              passwordProtected: true,
              accessToken: "test-access-proof",
              accessVersion: ACCESS_VERSION,
            },
          }),
        });
      },
    );

    await page.goto(PAGE_URL);
    await page.getByLabel("Contraseña del evento").fill("secreto123");
    await page.getByRole("button", { name: "Acceder" }).click();

    const pendingButton = page.getByRole("button", { name: "Verificando…" });
    await expect(pendingButton).toBeDisabled({ timeout: 5_000 });
    await expect(page.locator('form[aria-busy="true"]')).toBeVisible();
    await page.locator('form[aria-busy="true"]').evaluate((form) => {
      form.dispatchEvent(
        new SubmitEvent("submit", { bubbles: true, cancelable: true }),
      );
    });
    expect(verifyCalls).toBe(1);

    releaseVerification();
    await expect(page.getByLabel("Contraseña del evento")).not.toBeVisible({
      timeout: 10_000,
    });
  });

  test("muestra formulario de contraseña cuando passwordProtected es true", async ({
    page,
  }) => {
    await mockPageSpec(page, {
      passwordProtected: true,
      accessVersion: ACCESS_VERSION,
    });
    await mockVerifyAccess(page, "secreto123");
    await mockViewEndpoint(page);
    await page.goto(PAGE_URL);

    await expect(page.getByPlaceholder("Contraseña")).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByText(/Esta invitación es privada/i)).toBeVisible({
      timeout: 10_000,
    });
  });

  test("NO muestra contraseña incorrecta inicialmente", async ({ page }) => {
    await mockPageSpec(page, { passwordProtected: true });
    await mockVerifyAccess(page, "secreto123");
    await mockViewEndpoint(page);
    await page.goto(PAGE_URL);

    await expect(page.getByText(/Contraseña incorrecta/i)).not.toBeVisible({
      timeout: 10_000,
    });
  });

  test("botón Acceder está deshabilitado con campo vacío", async ({ page }) => {
    await mockPageSpec(page, { passwordProtected: true });
    await mockVerifyAccess(page, "secreto123");
    await mockViewEndpoint(page);
    await page.goto(PAGE_URL);

    await expect(page.getByRole("button", { name: "Acceder" })).toBeDisabled({
      timeout: 10_000,
    });
  });

  test("muestra error al ingresar contraseña incorrecta", async ({ page }) => {
    await mockPageSpec(page, { passwordProtected: true });
    await mockVerifyAccess(page, "secreto123");
    await mockViewEndpoint(page);
    await page.goto(PAGE_URL);

    await page.getByPlaceholder("Contraseña").fill("malapassword");
    await page.getByRole("button", { name: "Acceder" }).click();

    await expect(page.getByText(/Contraseña incorrecta/i)).toBeVisible({
      timeout: 10_000,
    });
  });

  test("muestra el contenido con contraseña correcta", async ({ page }) => {
    await mockPageSpec(page, { passwordProtected: true });
    await mockVerifyAccess(page, "secreto123");
    await mockViewEndpoint(page);
    await page.goto(PAGE_URL);

    await page.getByPlaceholder("Contraseña").fill("secreto123");
    await page.getByRole("button", { name: "Acceder" }).click();

    // After successful verification, page content (footer at least) should show
    await expect(page.getByPlaceholder("Contraseña")).not.toBeVisible({
      timeout: 10_000,
    });
  });

  test("guarda el proof bajo accessVersion devuelto por verify-access", async ({
    page,
  }) => {
    await mockPageSpec(page, { passwordProtected: true });
    await mockVerifyAccess(page, "secreto123");
    await mockViewEndpoint(page);
    await page.goto(PAGE_URL);

    await page.getByPlaceholder("Contraseña").fill("secreto123");
    await page.getByRole("button", { name: "Acceder" }).click();

    await expect
      .poll(
        () =>
          page.evaluate(
            (key: string) => sessionStorage.getItem(key),
            PASSWORD_VERIFICATION_KEY,
          ),
        { timeout: 5_000 },
      )
      .toBe("test-access-proof");
    await expect
      .poll(
        () =>
          page.evaluate(
            (key: string) => sessionStorage.getItem(key),
            UNVERSIONED_PASSWORD_VERIFICATION_KEY,
          ),
        { timeout: 5_000 },
      )
      .toBeNull();
  });

  test("NO muestra formulario de contraseña cuando passwordProtected es false", async ({
    page,
  }) => {
    await mockPageSpec(page, { passwordProtected: false });
    await mockViewEndpoint(page);
    await page.goto(PAGE_URL);

    await expect(page.getByPlaceholder("Contraseña")).not.toBeVisible({
      timeout: 10_000,
    });
  });

  test("preview_token no autorizado con invitación válida NO omite el formulario de contraseña", async ({
    page,
  }) => {
    await mockIdentifierPageSpec(page, {
      passwordProtected: true,
      previewAuthorized: false,
    });
    await mockVerifyAccess(page, "secreto123");
    await mockViewEndpoint(page);

    await page.goto(
      `${IDENTIFIER_PAGE_URL}?preview_token=bad-preview&token=${TOKEN}`,
    );

    await expect(page.getByPlaceholder("Contraseña")).toBeVisible({
      timeout: 10_000,
    });
  });

  test("preview_token autorizado omite gates y tracking de Studio", async ({
    page,
  }) => {
    const futureDate = new Date(
      Date.now() + 7 * 24 * 60 * 60 * 1000,
    ).toISOString();
    await mockIdentifierPageSpec(page, {
      activeFrom: futureDate,
      passwordProtected: true,
      previewAuthorized: true,
    });
    const viewCalled = await mockViewEndpoint(page);

    await page.goto(
      `${IDENTIFIER_PAGE_URL}?preview_token=signed-preview&t=studio`,
    );

    await expect(page.getByPlaceholder("Contraseña")).not.toBeVisible({
      timeout: 10_000,
    });
    await expect(
      page.getByText(/Esta invitación aún no está disponible/i),
    ).not.toBeVisible({ timeout: 10_000 });
    await page.waitForTimeout(1_000);
    expect(viewCalled()).toBe(false);
  });

  test("event_access_token en URL se envia como header al PageSpec y omite password gate", async ({
    page,
  }) => {
    let pageSpecProof = "";
    await mockViewEndpoint(page);
    await page.route(
      `${API_BASE}/api/events/${IDENTIFIER}/page-spec**`,
      async (route) => {
        pageSpecProof = route.request().headers()["x-event-access-token"] ?? "";
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(
            makePageSpecWithAccess({
              passwordProtected: true,
              passwordVerified: pageSpecProof === "query-proof",
              accessVersion: ACCESS_VERSION,
            }),
          ),
        });
      },
    );

    await page.goto(`${IDENTIFIER_PAGE_URL}?event_access_token=query-proof`);

    await expect
      .poll(() => pageSpecProof, { timeout: 5_000 })
      .toBe("query-proof");
    await expect(page.getByRole("textbox")).not.toBeVisible();
  });

  test("contraseña verificada se restaura desde sessionStorage (sin re-pedir)", async ({
    page,
  }) => {
    await mockPageSpec(page, {
      passwordProtected: true,
      accessVersion: ACCESS_VERSION,
    });
    await mockVerifyAccess(page, "secreto123");
    await mockViewEndpoint(page);

    // Inject signed proof into sessionStorage before the page loads
    await page.addInitScript((key: string) => {
      sessionStorage.setItem(key, "test-access-proof");
    }, PASSWORD_VERIFICATION_KEY);

    await page.goto(PAGE_URL);

    // Should NOT show the password form
    await expect(page.getByPlaceholder("Contraseña")).not.toBeVisible({
      timeout: 10_000,
    });
  });
});

// ── View Tracking ─────────────────────────────────────────────────────────────

test.describe("Satellite access gates", () => {
  test("proof expirado en pagina satelite se limpia y vuelve a pedir password", async ({
    page,
  }) => {
    const proofHeaders: string[] = [];
    let momentCalls = 0;

    await page.route(
      `${API_BASE}/api/events/${IDENTIFIER}/page-spec**`,
      async (route) => {
        proofHeaders.push(
          route.request().headers()["x-event-access-token"] ?? "",
        );
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(
            makePageSpecWithAccess({
              passwordProtected: true,
              accessVersion: ACCESS_VERSION,
            }),
          ),
        });
      },
    );

    await page.route(
      `${API_BASE}/api/events/${IDENTIFIER}/moments**`,
      async (route) => {
        momentCalls++;
        await route.fulfill({
          status: 401,
          contentType: "application/json",
          body: JSON.stringify({
            status: 401,
            message: "Event password required",
          }),
        });
      },
    );

    await page.addInitScript((key: string) => {
      sessionStorage.setItem(key, "expired-proof");
    }, SATELLITE_PASSWORD_VERIFICATION_KEY);

    await page.goto(`/e/${IDENTIFIER}/momentos`);

    await expect(page.getByPlaceholder("Contrasena")).toBeVisible({
      timeout: 10_000,
    });
    await expect
      .poll(() => proofHeaders.includes("expired-proof"), { timeout: 5_000 })
      .toBe(true);
    await expect
      .poll(
        () =>
          page.evaluate(
            (key: string) => sessionStorage.getItem(key),
            SATELLITE_PASSWORD_VERIFICATION_KEY,
          ),
        { timeout: 5_000 },
      )
      .toBeNull();
    expect(momentCalls).toBe(0);
  });

  test("pagina de momentos exige proof y luego llama /moments con header de acceso", async ({
    page,
  }) => {
    await mockIdentifierPageSpec(page, { passwordProtected: true });
    await mockVerifyAccess(page, "secreto123");

    let momentCalls = 0;
    let accessHeader = "";
    await page.route(
      `${API_BASE}/api/events/${IDENTIFIER}/moments**`,
      async (route) => {
        momentCalls++;
        accessHeader = route.request().headers()["x-event-access-token"] ?? "";
        await route.fulfill({
          status: accessHeader ? 200 : 401,
          contentType: "application/json",
          body: JSON.stringify(
            accessHeader
              ? {
                  status: 200,
                  message: "Moments loaded",
                  data: {
                    items: [],
                    total: 0,
                    page: 1,
                    limit: 25,
                    has_more: false,
                    published: true,
                    moments_wall_published: true,
                    show_moment_wall: true,
                    allow_uploads: false,
                    share_uploads_enabled: false,
                    uploads_limit: 30,
                    uploads_remaining: 30,
                    uploads_used: 0,
                    event_name: "Test Event",
                  },
                }
              : { status: 401, message: "Event password required" },
          ),
        });
      },
    );

    await page.goto(`/e/${IDENTIFIER}/momentos`);

    await expect(page.getByPlaceholder("Contrasena")).toBeVisible({
      timeout: 10_000,
    });
    expect(momentCalls).toBe(0);

    await page.getByPlaceholder("Contrasena").fill("secreto123");
    await page.getByRole("button", { name: "Entrar" }).click();

    await expect
      .poll(() => accessHeader, { timeout: 5_000 })
      .toBe("test-access-proof");
    await expect
      .poll(
        () =>
          page.evaluate(
            (key: string) => sessionStorage.getItem(key),
            SATELLITE_PASSWORD_VERIFICATION_KEY,
          ),
        { timeout: 5_000 },
      )
      .toBe("test-access-proof");
    expect(momentCalls).toBeGreaterThan(0);
  });
});

test.describe("Section access proof propagation", () => {
  test("pagina principal envia proof a resources y attendees despues de verificar password", async ({
    page,
  }) => {
    await mockVerifyAccess(page, "secreto123");
    await mockViewEndpoint(page);
    await mockS3Images(page);

    await page.route(
      `${API_BASE}/api/events/page-spec?token=${TOKEN}`,
      async (route) => {
        const accessProof = route.request().headers()["x-event-access-token"];
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            data: {
              meta: {
                pageTitle: "Test Event",
                identifier: IDENTIFIER,
                eventId: "evt-test-uuid-0001",
                access: accessProof
                  ? { passwordProtected: true, passwordVerified: true }
                  : { passwordProtected: true },
              },
              sections: accessProof
                ? [
                    {
                      type: "GraduationHero",
                      sectionId: SECTION_IDS.graduation.s1,
                      order: 1,
                      config: {
                        title: "NOS GRADUAMOS",
                        years: "2022 - 2025",
                        school: "PREPARATORIA",
                      },
                    },
                    {
                      type: "GraduatesList",
                      sectionId: SECTION_IDS.graduation.s4,
                      order: 2,
                      config: { closing: "celebremos juntos" },
                    },
                  ]
                : [],
            },
          }),
        });
      },
    );

    let heroResourceHeader = "";
    let graduatesResourceHeader = "";
    let attendeesHeader = "";
    await page.route(
      `${API_BASE}/api/resources/section/${SECTION_IDS.graduation.s1}**`,
      async (route) => {
        heroResourceHeader =
          route.request().headers()["x-event-access-token"] ?? "";
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(
            makeSectionResponse(SECTION_IDS.graduation.s1, 2),
          ),
        });
      },
    );
    await page.route(
      `${API_BASE}/api/resources/section/${SECTION_IDS.graduation.s4}**`,
      async (route) => {
        graduatesResourceHeader =
          route.request().headers()["x-event-access-token"] ?? "";
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(
            makeSectionResponse(SECTION_IDS.graduation.s4, 1),
          ),
        });
      },
    );
    await page.route(
      `${API_BASE}/api/events/section/${SECTION_IDS.graduation.s4}/attendees**`,
      async (route) => {
        attendeesHeader =
          route.request().headers()["x-event-access-token"] ?? "";
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            status: 200,
            message: "Attendees loaded",
            data: TEST_GRADUATION_ATTENDEES,
          }),
        });
      },
    );

    await page.goto(PAGE_URL);

    await page.getByRole("textbox").fill("secreto123");
    await page.getByRole("button", { name: "Acceder" }).click();

    await expect(
      page.getByRole("heading", { name: "NOS GRADUAMOS" }),
    ).toBeVisible({ timeout: 10_000 });
    await expect
      .poll(() => heroResourceHeader, { timeout: 5_000 })
      .toBe("test-access-proof");

    await page
      .locator(`#section-${SECTION_IDS.graduation.s4}`)
      .scrollIntoViewIfNeeded();
    await expect
      .poll(() => graduatesResourceHeader, { timeout: 5_000 })
      .toBe("test-access-proof");
    await expect
      .poll(() => attendeesHeader, { timeout: 5_000 })
      .toBe("test-access-proof");
  });
});

test.describe("View tracking", () => {
  test("llama POST /view después de cargar el page-spec", async ({ page }) => {
    await mockPageSpec(page, {});
    let viewCalled = false;
    await page.route(
      `${API_BASE}/api/events/${IDENTIFIER}/view**`,
      async (route) => {
        viewCalled = true;
        await route.fulfill({
          status: 200,
          body: JSON.stringify({ data: null }),
        });
      },
    );

    await page.goto(PAGE_URL);

    // Wait for page to settle
    await page.waitForTimeout(2_000);
    expect(viewCalled).toBe(true);
  });

  test("NO llama /view cuando el spec ya está en caché (misma sesión)", async ({
    page,
  }) => {
    await mockPageSpec(page, {});
    let viewCallCount = 0;
    await page.route(
      `${API_BASE}/api/events/${IDENTIFIER}/view**`,
      async (route) => {
        viewCallCount++;
        await route.fulfill({
          status: 200,
          body: JSON.stringify({ data: null }),
        });
      },
    );

    // Inject sessionStorage token marker BEFORE page loads to simulate "already viewed"
    await page.addInitScript((key: string) => {
      sessionStorage.setItem(key, "1");
    }, VIEW_TRACKING_KEY);

    await page.goto(PAGE_URL);
    await page.waitForTimeout(2_000);

    expect(viewCallCount).toBe(0);
  });

  test("guarda view-tracked en sessionStorage después del primer hit", async ({
    page,
  }) => {
    await mockPageSpec(page, {});
    await page.route(
      `${API_BASE}/api/events/${IDENTIFIER}/view**`,
      async (route) => {
        await route.fulfill({
          status: 200,
          body: JSON.stringify({ data: null }),
        });
      },
    );

    await page.goto(PAGE_URL);
    await page.waitForTimeout(2_000);

    const stored = await page.evaluate(
      (key: string) => sessionStorage.getItem(key),
      VIEW_TRACKING_KEY,
    );
    expect(stored).toBe("1");
  });

  test("no guarda view-tracked cuando backend ignora el conteo", async ({
    page,
  }) => {
    await mockPageSpec(page, {});
    await page.route(
      `${API_BASE}/api/events/${IDENTIFIER}/view**`,
      async (route) => {
        await route.fulfill({
          status: 200,
          body: JSON.stringify({
            status: 200,
            message: "View ignored",
            data: { tracked: false },
          }),
        });
      },
    );

    await page.goto(PAGE_URL);
    await page.waitForTimeout(2_000);

    const stored = await page.evaluate(
      (key: string) => sessionStorage.getItem(key),
      VIEW_TRACKING_KEY,
    );
    expect(stored).toBeNull();
  });
});

test.describe("View tracking gates", () => {
  test("does not call /view or mark session before activeFrom opens", async ({
    page,
  }) => {
    const futureDate = new Date(
      Date.now() + 7 * 24 * 60 * 60 * 1000,
    ).toISOString();
    await mockPageSpec(page, { activeFrom: futureDate });
    const viewCalled = await mockViewEndpoint(page);

    await page.goto(PAGE_URL);

    await expect(
      page.getByRole("heading", { name: /disponible/i }),
    ).toBeVisible({ timeout: 10_000 });
    await page.waitForTimeout(1_000);
    expect(viewCalled()).toBe(false);

    const stored = await page.evaluate(
      (key: string) => sessionStorage.getItem(key),
      VIEW_TRACKING_KEY,
    );
    expect(stored).toBeNull();
  });

  test("calls /view only after password verification", async ({ page }) => {
    await mockPageSpec(page, { passwordProtected: true });
    await mockVerifyAccess(page, "secreto123");
    let viewCallCount = 0;
    await page.route(
      `${API_BASE}/api/events/${IDENTIFIER}/view**`,
      async (route) => {
        viewCallCount++;
        await route.fulfill({
          status: 200,
          body: JSON.stringify({ data: null }),
        });
      },
    );

    await page.goto(PAGE_URL);
    const passwordInput = page.getByRole("textbox");
    await expect(passwordInput).toBeVisible({ timeout: 10_000 });
    await page.waitForTimeout(1_000);
    expect(viewCallCount).toBe(0);

    await passwordInput.fill("secreto123");
    await page.getByRole("button", { name: "Acceder" }).click();

    await expect(passwordInput).not.toBeVisible({ timeout: 10_000 });
    await expect.poll(() => viewCallCount, { timeout: 3_000 }).toBe(1);
  });
});
