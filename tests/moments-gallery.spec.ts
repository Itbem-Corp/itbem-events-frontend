import { expect, test, type Page } from "@playwright/test";
import { API_BASE, installApiGuard } from "./helpers/mocks";
import { installStorageClearScript } from "./helpers/storage";

const IDENTIFIER = "gallery-async-test";
const PAGE_URL = `/e/${IDENTIFIER}/momentos`;
const S3_BASE =
  "https://itbem-events-bucket-prod.s3.us-east-2.amazonaws.com/test";
const ONE_PIXEL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

interface GalleryMoment {
  id: string;
  content_url: string;
  thumbnail_url: string;
  content_type: string;
  description: string;
  created_at: string;
  processing_status: string;
}

function makePhoto(id: string, description: string): GalleryMoment {
  return {
    id,
    content_url: `${S3_BASE}/${id}-full.png`,
    thumbnail_url: `${S3_BASE}/${id}-thumb.png`,
    content_type: "image/png",
    description,
    created_at: "2026-07-09T12:00:00Z",
    processing_status: "done",
  };
}

async function mockGallery(page: Page, moments: GalleryMoment[]) {
  await page.route(
    `${API_BASE}/api/events/${IDENTIFIER}/page-spec**`,
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            meta: {
              pageTitle: "Galería async",
              identifier: IDENTIFIER,
              eventId: "event-gallery-async",
              access: { passwordProtected: false },
            },
            sections: [],
          },
        }),
      });
    },
  );

  await page.route(
    `${API_BASE}/api/events/${IDENTIFIER}/moments**`,
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            items: moments,
            total: moments.length,
            page: 1,
            limit: 500,
            has_more: false,
            published: true,
            moments_wall_published: true,
            show_moment_wall: true,
            uploads_limit: 30,
            uploads_remaining: 30,
            uploads_used: 0,
            event_name: "Celebración async",
          },
        }),
      });
    },
  );

  await page.route(`${S3_BASE}/**`, async (route) => {
    const isVideo = route.request().url().endsWith(".mp4");
    await route.fulfill({
      status: 200,
      contentType: isVideo ? "video/mp4" : "image/png",
      body: isVideo ? Buffer.alloc(0) : ONE_PIXEL_PNG,
    });
  });
}

test.beforeEach(async ({ page }) => {
  await installStorageClearScript(page);
  await installApiGuard(page);
});

test("descarga el visor solo por intención y conserva foco, teclado y scroll", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await mockGallery(page, [
    makePhoto("photo-one", "Primer momento"),
    makePhoto("photo-two", "Segundo momento"),
  ]);

  let releaseLightboxModule: () => void = () => {};
  let lightboxModuleStarted = false;
  const lightboxModuleGate = new Promise<void>((resolve) => {
    releaseLightboxModule = resolve;
  });
  await page.route(/MomentsGalleryLightbox\.tsx/, async (route) => {
    lightboxModuleStarted = true;
    await lightboxModuleGate;
    await route.continue();
  });

  const lightboxRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("MomentsGalleryLightbox")) {
      lightboxRequests.push(request.url());
    }
  });

  await page.goto(PAGE_URL);
  const opener = page.getByRole("button", {
    name: "Abrir foto: Primer momento",
  });
  await expect(opener).toBeVisible({ timeout: 15_000 });
  expect(lightboxRequests).toHaveLength(0);

  await opener.click();
  await expect.poll(() => lightboxModuleStarted).toBe(true);
  await expect.poll(() => lightboxRequests.length).toBeGreaterThan(0);

  const loadingDialog = page.getByRole("dialog", {
    name: "Abriendo visor de foto",
  });
  const loadingCloseButton = page.getByRole("button", {
    name: "Cerrar visor de foto",
  });
  await expect(loadingDialog).toBeVisible();
  await expect(loadingCloseButton).toBeFocused();
  await expect
    .poll(() => page.evaluate(() => document.body.style.overflow))
    .toBe("hidden");

  releaseLightboxModule();

  const dialog = page.getByRole("dialog", { name: "Visor de foto" });
  const closeButton = page.getByRole("button", {
    name: "Cerrar visor de foto",
  });
  const nextButton = page.getByRole("button", {
    name: "Momento siguiente, 2 de 2",
  });
  await expect(dialog).toBeVisible();
  await expect(loadingDialog).not.toBeVisible();
  await expect(closeButton).toBeFocused();
  await expect
    .poll(() => page.evaluate(() => document.body.style.overflow))
    .toBe("hidden");

  await page.keyboard.press("Shift+Tab");
  await expect(nextButton).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(closeButton).toBeFocused();

  await page.keyboard.press("ArrowRight");
  await expect(dialog.getByText("2 / 2")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Momento anterior, 1 de 2" }),
  ).toBeVisible();

  const fullImage = dialog.getByRole("img", { name: "Segundo momento" });
  await expect(fullImage).toBeVisible();
  await expect
    .poll(() =>
      fullImage.evaluate((image) => getComputedStyle(image).transitionProperty),
    )
    .toBe("none");

  const caption = dialog.getByText("“Segundo momento”");
  const captionBox = await caption.boundingBox();
  const viewport = page.viewportSize();
  expect(captionBox).not.toBeNull();
  expect(viewport).not.toBeNull();
  if (captionBox && viewport) {
    expect(captionBox.x).toBeGreaterThanOrEqual(0);
    expect(captionBox.x + captionBox.width).toBeLessThanOrEqual(viewport.width);
    expect(
      Math.abs(captionBox.x + captionBox.width / 2 - viewport.width / 2),
    ).toBeLessThanOrEqual(1);
  }

  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(opener).toBeFocused();
  await expect
    .poll(() => page.evaluate(() => document.body.style.overflow))
    .toBe("");
});

test("el visor de video expone diálogo y cierre accesibles", async ({ page }) => {
  await mockGallery(page, [
    {
      id: "video-one",
      content_url: `${S3_BASE}/video-one.mp4`,
      thumbnail_url: `${S3_BASE}/video-one.png`,
      content_type: "video/mp4",
      description: "Video principal",
      created_at: "2026-07-09T12:00:00Z",
      processing_status: "done",
    },
  ]);

  await page.goto(PAGE_URL);
  const opener = page.getByRole("button", {
    name: "Abrir video: Video principal",
  });
  await expect(opener).toBeVisible({ timeout: 15_000 });
  await opener.click();

  const dialog = page.getByRole("dialog", { name: "Visor de video" });
  const closeButton = page.getByRole("button", {
    name: "Cerrar visor de video",
  });
  await expect(dialog).toBeVisible();
  await expect(closeButton).toBeFocused();

  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(opener).toBeFocused();
});
