import { expect, test } from "@playwright/test";
import {
  installApiGuard,
  mockInvitation,
  mockWeddingPageSpec,
  mockWeddingResources,
} from "./helpers/mocks";
import { installStorageClearScript } from "./helpers/storage";

const TOKEN = "test-token-abc";

test.beforeEach(async ({ page }) => {
  await installStorageClearScript(page);
  await installApiGuard(page);
  await mockWeddingPageSpec(page);
  await mockWeddingResources(page);
});

test("loads RSVP invitation when the URL uses pretty_token", async ({
  page,
}) => {
  await mockInvitation(page, "", TOKEN);

  await page.goto(`/AndresIvanna/Confirmacion?pretty_token=${TOKEN}`);

  await expect(page.getByText(/No\. personas:/).first()).toBeVisible({
    timeout: 10_000,
  });
});
