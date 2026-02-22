// tests/helpers/mocks.ts
// Route installers for intercepting API calls in Playwright tests.
// All handlers must be installed BEFORE page.goto() to guarantee they
// are active when the first fetch fires from React useEffect.

import type { Page } from '@playwright/test';
import {
  makeSectionResponse,
  makeInvitationResponse,
  makeGraduationPageSpec,
  makeWeddingPageSpec,
  TEST_GRADUATION_ATTENDEES,
  RSVP_SUCCESS,
  SECTION_IDS,
  TEST_TOKENS,
  makeMomentWallPageSpec,
  makeMomentsResponse,
  makeMoment,
  MOMENT_EVENT_IDENTIFIER,
} from '../fixtures/api-data';

export const API_BASE = 'http://api.eventiapp.com.mx';

// Resource count per graduation section (mirrors actual backend data shape)
const GRADUATION_RESOURCE_COUNTS: Record<string, number> = {
  [SECTION_IDS.graduation.s1]: 2, // hero + school logo
  [SECTION_IDS.graduation.s2]: 3, // 2-grid + single
  [SECTION_IDS.graduation.s3]: 4, // 2×2 grid around map
  [SECTION_IDS.graduation.s4]: 1, // group photo banner
  [SECTION_IDS.graduation.s5]: 5, // 2+3 photo grid
};

// Intercept S3 image requests so ImageWithLoader exits the loading state
// (animate-pulse) immediately without hitting real AWS S3.
export async function mockS3Images(page: Page): Promise<void> {
  await page.route(
    'https://itbem-events-bucket-prod.s3.us-east-2.amazonaws.com/**',
    async (route) => {
      await route.fulfill({ status: 404, body: '' });
    }
  );
}

// ---------------------------------------------------------------------------
// Graduation page mocks
// ---------------------------------------------------------------------------

export async function mockGraduationPageSpec(page: Page, token = TEST_TOKENS.graduation): Promise<void> {
  await page.route(
    `${API_BASE}/api/events/page-spec?token=${token}`,
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(makeGraduationPageSpec()),
      });
    }
  );
}

export async function mockGraduationAttendees(page: Page): Promise<void> {
  await page.route(
    `${API_BASE}/api/events/section/${SECTION_IDS.graduation.s4}/attendees`,
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: TEST_GRADUATION_ATTENDEES }),
      });
    }
  );
}

export async function mockGraduationResources(page: Page): Promise<void> {
  for (const [, sectionId] of Object.entries(SECTION_IDS.graduation)) {
    await page.route(
      `${API_BASE}/api/resources/section/${sectionId}`,
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(
            makeSectionResponse(sectionId, GRADUATION_RESOURCE_COUNTS[sectionId] ?? 2)
          ),
        });
      }
    );
  }
  await mockS3Images(page);
}

// ---------------------------------------------------------------------------
// Wedding page mocks
// ---------------------------------------------------------------------------

export async function mockWeddingPageSpec(page: Page, token = TEST_TOKENS.wedding): Promise<void> {
  await page.route(
    `${API_BASE}/api/events/page-spec?token=${token}`,
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(makeWeddingPageSpec()),
      });
    }
  );
}

export async function mockWeddingResources(page: Page): Promise<void> {
  await page.route(
    `${API_BASE}/api/resources/section/${SECTION_IDS.wedding.s1}`,
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(makeSectionResponse(SECTION_IDS.wedding.s1, 2)),
      });
    }
  );
  await mockS3Images(page);
}

// Install invitation GET mock for a given token and RSVP status.
// Note: Echo v4 is case-sensitive — route is ByToken (capital B and T).
export async function mockInvitation(
  page: Page,
  status: '' | 'confirmed' | 'declined' = '',
  token = TEST_TOKENS.wedding
): Promise<void> {
  await page.route(
    `${API_BASE}/api/invitations/ByToken/${token}`,
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(makeInvitationResponse({ status })),
      });
    }
  );
}

// Install RSVP POST mock — success or failure with custom message.
export async function mockRsvpPost(
  page: Page,
  options: { success: boolean; errorMessage?: string } = { success: true }
): Promise<void> {
  await page.route(`${API_BASE}/api/invitations/rsvp`, async (route) => {
    if (options.success) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(RSVP_SUCCESS),
      });
    } else {
      await route.fulfill({
        status: 422,
        contentType: 'application/json',
        body: JSON.stringify({ message: options.errorMessage ?? 'Token inválido' }),
      });
    }
  });
}

// Silently absorb POST /events/:identifier/view — it's fire-and-forget, should never
// cause test failures if accidentally not mocked in other suites.
export async function mockViewTracking(page: Page, identifier = '.*'): Promise<void> {
  await page.route(
    new RegExp(`${API_BASE}/api/events/${identifier}/view`),
    async (route) => { await route.fulfill({ status: 200, body: '{"data":null}' }); }
  );
}

// Catch-all guard: any unmocked API call returns 500.
// Install FIRST so specific mocks (registered after) take precedence.
// Playwright matches routes LIFO (last-in, first-out) — later registrations win.
export async function installApiGuard(page: Page): Promise<void> {
  await page.route(`${API_BASE}/**`, async (route) => {
    const url = route.request().url();
    // Allow fire-and-forget view tracking to pass silently
    if (url.includes('/view') && route.request().method() === 'POST') {
      await route.fulfill({ status: 200, body: '{"data":null}' });
      return;
    }
    console.error(`[TEST GUARD] Unmocked API call: ${url}`);
    await route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ error: `Unmocked: ${url}` }),
    });
  });
}

// -- MomentWall helpers --

export const MOMENT_TEST_TOKEN = 'momento-test-token';

/** Intercepts GET page-spec to return a MomentWall-only event page. */
export async function mockMomentWallPageSpec(
  page: Page,
  identifier = MOMENT_EVENT_IDENTIFIER,
  token = MOMENT_TEST_TOKEN,
): Promise<void> {
  await page.route(
    API_BASE + '/api/events/page-spec?token=' + token,
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(makeMomentWallPageSpec(identifier)),
      });
    }
  );
}

/**
 * Intercepts GET /api/events/:identifier/moments?... (paginated public wall).
 * Regex requires a query string so it only matches GET requests from the wall.
 */
export async function mockMomentsGet(
  page: Page,
  identifier = MOMENT_EVENT_IDENTIFIER,
  moments: ReturnType<typeof makeMoment>[] = [],
): Promise<void> {
  await page.route(
    new RegExp(API_BASE.replace(/\./g, '[.]') + '/api/events/' + identifier + '/moments[?]'),
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(makeMomentsResponse({ items: moments })),
      });
    }
  );
}

/**
 * Intercepts POST /api/events/:identifier/moments (guest upload).
 * String pattern matches only the bare URL without query params.
 */
export async function mockMomentsPost(
  page: Page,
  identifier = MOMENT_EVENT_IDENTIFIER,
  success = true,
): Promise<void> {
  await page.route(
    API_BASE + '/api/events/' + identifier + '/moments',
    async (route) => {
      if (route.request().method() !== 'POST') {
        await route.continue();
        return;
      }
      if (success) {
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({ data: { id: 'new-moment-001', uploads_remaining: 2 } }),
        });
      } else {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'Error interno del servidor' }),
        });
      }
    }
  );
}

/** Intercepts the InvitationLoader GET for the MomentWall auth flow. */
export async function mockMomentWallInvitation(
  page: Page,
  token = MOMENT_TEST_TOKEN,
  prettyToken = 'MOMENTO-1234',
): Promise<void> {
  await page.route(
    API_BASE + '/api/invitations/ByToken/' + token,
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(makeInvitationResponse({ prettyToken })),
      });
    }
  );
}
