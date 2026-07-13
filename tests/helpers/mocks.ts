// tests/helpers/mocks.ts
// Route installers for intercepting API calls in Playwright tests.
// All handlers must be installed BEFORE page.goto() to guarantee they
// are active when the first fetch fires from React useEffect.

import type { Page, Request } from "@playwright/test";
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
} from "../fixtures/api-data";

// Strip trailing slash so route patterns are built consistently:
//   `${API_BASE}/api/...` always produces a valid URL.
// Reads PUBLIC_EVENTS_URL from process.env (loaded by playwright.config.ts from .env)
// so mock interceptors always match the URL the running dev server is configured with.
export const API_BASE = (
  process.env["PUBLIC_EVENTS_URL"] ?? "http://api.eventiapp.com.mx/"
).replace(/\/$/, "");

export function invitationByTokenUrl(token: string): string {
  const url = new URL(`${API_BASE}/api/invitations/ByToken`);
  url.searchParams.set("token", token);
  return url.toString();
}

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
    "https://itbem-events-bucket-prod.s3.us-east-2.amazonaws.com/**",
    async (route) => {
      await route.fulfill({ status: 404, body: "" });
    },
  );
}

// ---------------------------------------------------------------------------
// Graduation page mocks
// ---------------------------------------------------------------------------

export async function mockGraduationPageSpec(
  page: Page,
  token = TEST_TOKENS.graduation,
): Promise<void> {
  await page.route(
    `${API_BASE}/api/events/page-spec?token=${token}`,
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(makeGraduationPageSpec()),
      });
    },
  );
}

export async function mockGraduationAttendees(page: Page): Promise<void> {
  await page.route(
    `${API_BASE}/api/events/section/${SECTION_IDS.graduation.s4}/attendees**`,
    async (route) => {
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
}

export async function mockGraduationResources(page: Page): Promise<void> {
  for (const [, sectionId] of Object.entries(SECTION_IDS.graduation)) {
    await page.route(
      `${API_BASE}/api/resources/section/${sectionId}**`,
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(
            makeSectionResponse(
              sectionId,
              GRADUATION_RESOURCE_COUNTS[sectionId] ?? 2,
            ),
          ),
        });
      },
    );
  }
  await mockS3Images(page);
}

// ---------------------------------------------------------------------------
// Wedding page mocks
// ---------------------------------------------------------------------------

export async function mockWeddingPageSpec(
  page: Page,
  token = TEST_TOKENS.wedding,
): Promise<void> {
  await page.route(
    `${API_BASE}/api/events/page-spec?token=${token}`,
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(makeWeddingPageSpec()),
      });
    },
  );
}

export async function mockWeddingResources(page: Page): Promise<void> {
  await page.route(
    `${API_BASE}/api/resources/section/${SECTION_IDS.wedding.s1}**`,
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(makeSectionResponse(SECTION_IDS.wedding.s1, 2)),
      });
    },
  );
  await mockS3Images(page);
}

// Install invitation GET mock for a given token and RSVP status.
// Note: Echo v4 is case-sensitive — route is ByToken (capital B and T).
export async function mockInvitation(
  page: Page,
  status: "" | "confirmed" | "declined" = "",
  token = TEST_TOKENS.wedding,
): Promise<void> {
  await page.route(invitationByTokenUrl(token), async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(makeInvitationResponse({ status })),
    });
  });
}

// Install RSVP POST mock — success or failure with custom message.
export async function mockRsvpPost(
  page: Page,
  options: { success: boolean; errorMessage?: string } = { success: true },
): Promise<void> {
  await page.route(`${API_BASE}/api/invitations/rsvp`, async (route) => {
    if (options.success) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(RSVP_SUCCESS),
      });
    } else {
      await route.fulfill({
        status: 422,
        contentType: "application/json",
        body: JSON.stringify({
          message: options.errorMessage ?? "Token inválido",
        }),
      });
    }
  });
}

// Silently absorb POST /events/:identifier/view — it's fire-and-forget, should never
// cause test failures if accidentally not mocked in other suites.
export async function mockViewTracking(
  page: Page,
  identifier = ".*",
): Promise<void> {
  await page.route(
    new RegExp(`${API_BASE}/api/events/${identifier}/view`),
    async (route) => {
      await route.fulfill({ status: 200, body: '{"data":null}' });
    },
  );
}

// Catch-all guard: any unmocked API call returns 500.
// Install FIRST so specific mocks (registered after) take precedence.
// Playwright matches routes LIFO (last-in, first-out) — later registrations win.
export async function installApiGuard(page: Page): Promise<void> {
  await page.route(`${API_BASE}/**`, async (route) => {
    const url = route.request().url();
    const pathname = new URL(url).pathname;
    // Allow fire-and-forget view tracking to pass silently
    if (url.includes("/view") && route.request().method() === "POST") {
      await route.fulfill({ status: 200, body: '{"data":null}' });
      return;
    }
    // Public media is served from the backend host under /storage; it is not an API contract.
    if (pathname.startsWith("/storage/")) {
      await route.fulfill({ status: 404, body: "" });
      return;
    }
    console.error(`[TEST GUARD] Unmocked API call: ${url}`);
    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: `Unmocked: ${url}` }),
    });
  });
}

// -- MomentWall helpers --

export const MOMENT_TEST_TOKEN = "momento-test-token";

/** Intercepts GET page-spec to return a MomentWall-only event page. */
export async function mockMomentWallPageSpec(
  page: Page,
  identifier = MOMENT_EVENT_IDENTIFIER,
  token = MOMENT_TEST_TOKEN,
  configOverrides: Record<string, unknown> = {},
): Promise<void> {
  const response = JSON.stringify(
    makeMomentWallPageSpec(identifier, configOverrides),
  );
  await page.route(
    API_BASE + "/api/events/page-spec?token=" + token,
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: response,
      });
    },
  );
  await page.route(
    API_BASE + "/api/events/" + identifier + "/page-spec**",
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: response,
      });
    },
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
    new RegExp(
      API_BASE.replace(/\./g, "[.]") +
        "/api/events/" +
        identifier +
        "/moments[?]",
    ),
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(makeMomentsResponse({ items: moments })),
      });
    },
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
  const uploadUrl =
    "https://itbem-events-bucket-prod.s3.us-east-2.amazonaws.com/test/moment-upload.jpg?X-Amz-Signature=fake";
  const s3Key = `moments/${identifier}/moment-upload.jpg`;

  await page.route(
    API_BASE + "/api/events/" + identifier + "/moments/upload-url",
    async (route) => {
      if (route.request().method() !== "POST") {
        await route.continue();
        return;
      }
      if (success) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            status: 200,
            message: "success",
            data: { upload_url: uploadUrl, object_key: s3Key, s3_key: s3Key },
          }),
        });
      } else {
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({
            status: 500,
            message: "Error interno del servidor",
            error: "internal_error",
          }),
        });
      }
    },
  );

  await page.route(uploadUrl, async (route) => {
    if (route.request().method() !== "PUT") {
      await route.continue();
      return;
    }
    await route.fulfill({ status: 200, body: "" });
  });

  await page.route(
    API_BASE + "/api/events/" + identifier + "/moments/confirm",
    async (route) => {
      if (route.request().method() !== "POST") {
        await route.continue();
        return;
      }
      if (success) {
        await route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify({
            status: 201,
            message: "success",
            data: { id: "new-moment-001", uploads_remaining: 2 },
          }),
        });
      } else {
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({
            status: 500,
            message: "Error interno del servidor",
            error: "internal_error",
          }),
        });
      }
    },
  );
}

/**
 * Intercepts the InvitationLoader GET for the MomentWall auth flow — returns 404
 * (no invitation found). Use for anonymous-visitor tests so the API guard does not
 * log a console.error for the unmocked invitation endpoint.
 */
export async function mockMomentWallInvitationNotFound(
  page: Page,
  token = MOMENT_TEST_TOKEN,
): Promise<void> {
  await page.route(invitationByTokenUrl(token), async (route) => {
    await route.fulfill({
      status: 404,
      contentType: "application/json",
      body: JSON.stringify({ message: "Invitation not found" }),
    });
  });
}

/** Intercepts the InvitationLoader GET for the MomentWall auth flow. */
export async function mockMomentWallInvitation(
  page: Page,
  token = MOMENT_TEST_TOKEN,
  prettyToken = "MOMENTO-1234",
): Promise<void> {
  await page.route(invitationByTokenUrl(token), async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(makeInvitationResponse({ prettyToken })),
    });
  });
}

// -- Shared upload helpers --

interface SharedUploadStatusOptions {
  status?: number;
  message?: string;
  allowUploads?: boolean;
  shareUploadsEnabled?: boolean;
  wallPublished?: boolean;
  eventPublished?: boolean;
  uploadsRemaining?: number;
  eventName?: string;
}

export async function mockSharedUploadStatus(
  page: Page,
  identifier = MOMENT_EVENT_IDENTIFIER,
  options: SharedUploadStatusOptions = {},
): Promise<void> {
  await page.route(
    API_BASE + "/api/events/" + identifier + "/page-spec**",
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          status: 200,
          message: "Page spec loaded",
          data: {
            meta: {
              pageTitle: options.eventName ?? "Momentos del Evento",
              identifier,
              eventId: "evt-shared-upload",
              access: { passwordProtected: false },
            },
            sections: [],
          },
        }),
      });
    },
  );
  await page.route(
    new RegExp(
      API_BASE.replace(/\./g, "[.]") +
        "/api/events/" +
        identifier +
        "/moments[?]",
    ),
    async (route) => {
      if (route.request().method() !== "GET") {
        await route.continue();
        return;
      }
      const status = options.status ?? 200;
      if (status >= 400) {
        await route.fulfill({
          status,
          contentType: "application/json",
          body: JSON.stringify({
            status,
            message: options.message ?? "Upload status unavailable",
          }),
        });
        return;
      }
      const wallPublished = options.wallPublished === true;
      const allowUploads = options.allowUploads ?? !wallPublished;
      const shareUploadsEnabled =
        allowUploads && (options.shareUploadsEnabled ?? true) && !wallPublished;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          status: 200,
          message: "Upload status loaded",
          data: {
            items: [],
            total: 0,
            page: 1,
            limit: 1,
            has_more: false,
            published: options.eventPublished ?? wallPublished,
            moments_wall_published: wallPublished,
            show_moment_wall: wallPublished,
            allow_uploads: allowUploads,
            share_uploads_enabled: shareUploadsEnabled,
            uploads_limit: 30,
            uploads_remaining: options.uploadsRemaining ?? 30,
            uploads_used: 0,
            event_name: options.eventName ?? "Momentos del Evento",
          },
        }),
      });
    },
  );
}

interface SharedBatchUploadOptions {
  status?: number;
  message?: string;
  uploadsRemaining?: number;
  onBatch?: (files: unknown[]) => void;
  onPut?: (request: Request) => void;
}

function sharedUploadFileContract(file: unknown, index: number) {
  const record =
    file && typeof file === "object" ? (file as Record<string, unknown>) : {};
  const filename =
    typeof record["filename"] === "string"
      ? record["filename"]
      : typeof record["fileName"] === "string"
        ? record["fileName"]
        : `file-${index}.jpg`;
  const contentType =
    typeof record["content_type"] === "string"
      ? record["content_type"]
      : typeof record["contentType"] === "string"
        ? record["contentType"]
        : "image/jpeg";
  const extMatch = filename.match(/\.[a-z0-9]+$/i);
  const extension = extMatch?.[0].toLowerCase() ?? ".jpg";

  return { contentType, extension };
}

export async function mockSharedBatchUploadUrls(
  page: Page,
  identifier = MOMENT_EVENT_IDENTIFIER,
  options: SharedBatchUploadOptions = {},
): Promise<void> {
  await page.route(
    API_BASE +
      "/api/events/" +
      identifier +
      "/moments/shared/batch-upload-urls",
    async (route) => {
      if (route.request().method() !== "POST") {
        await route.continue();
        return;
      }
      const body = route.request().postDataJSON() as { files?: unknown[] };
      const files = body.files ?? [];
      options.onBatch?.(files);

      if (options.status && options.status >= 400) {
        await route.fulfill({
          status: options.status,
          contentType: "application/json",
          body: JSON.stringify({
            status: options.status,
            message: options.message ?? "No se pudo preparar la subida",
            error: options.status === 429 ? "rate_limited" : "upload_error",
            data:
              options.uploadsRemaining === undefined
                ? undefined
                : {
                    uploads_limit: 30,
                    uploads_used: 30 - options.uploadsRemaining,
                    uploads_remaining: options.uploadsRemaining,
                  },
          }),
        });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          status: 200,
          message: "Upload URLs created",
          data: {
            uploads_limit: 30,
            uploads_used: 30 - (options.uploadsRemaining ?? 30),
            uploads_remaining: options.uploadsRemaining ?? 30,
            urls: files.map((file, index) => {
              const contract = sharedUploadFileContract(file, index);
              const objectKey = `moments/${identifier}/shared/file-${index}${contract.extension}`;
              return {
                upload_url: `https://itbem-events-bucket-prod.s3.us-east-2.amazonaws.com/shared/${identifier}/file-${index}${contract.extension}?X-Amz-Signature=fake-${index}`,
                object_key: objectKey,
                s3_key: objectKey,
                content_type: contract.contentType,
              };
            }),
          },
        }),
      });
    },
  );

  await page.route(
    `https://itbem-events-bucket-prod.s3.us-east-2.amazonaws.com/shared/${identifier}/**`,
    async (route) => {
      if (route.request().method() !== "PUT") {
        await route.continue();
        return;
      }
      options.onPut?.(route.request());
      await route.fulfill({ status: 200, body: "" });
    },
  );
}

interface SharedConfirmOptions {
  status?: number;
  message?: string;
  uploadsRemaining?: number;
  onConfirm?: (payload: unknown) => void;
}

export async function mockSharedMomentConfirm(
  page: Page,
  identifier = MOMENT_EVENT_IDENTIFIER,
  options: SharedConfirmOptions = {},
): Promise<void> {
  await page.route(
    API_BASE + "/api/events/" + identifier + "/moments/shared/confirm",
    async (route) => {
      if (route.request().method() !== "POST") {
        await route.continue();
        return;
      }
      const payload = route.request().postDataJSON();
      options.onConfirm?.(payload);
      const status = options.status ?? 201;
      await route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify({
          status,
          message:
            options.message ??
            (status >= 400
              ? "Error confirmando subida"
              : "Moment submitted for review"),
          error: status >= 400 ? "confirm_error" : undefined,
          data:
            status >= 400
              ? options.uploadsRemaining === undefined
                ? undefined
                : {
                    uploads_limit: 30,
                    uploads_used: 30 - options.uploadsRemaining,
                    uploads_remaining: options.uploadsRemaining,
                  }
              : {
                  id: "shared-moment-001",
                  uploads_limit: 30,
                  uploads_remaining: options.uploadsRemaining ?? 29,
                  uploads_used: 1,
                },
        }),
      });
    },
  );
}
