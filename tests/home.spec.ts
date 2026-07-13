import { expect, test } from "@playwright/test";

test.describe("EventiApp landing", () => {
  test("renders the premium entry point and routes both primary actions", async ({
    page,
  }) => {
    await page.goto("/");

    await expect(page.locator("main[data-eventi-home]")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: /cada momento/i, level: 1 }),
    ).toBeVisible();

    const dashboardUrl = "https://dashboard.eventiapp.com.mx";
    await expect(page.getByRole("link", { name: "Crear mi evento" })).toHaveAttribute(
      "href",
      dashboardUrl,
    );
    await expect(
      page.getByRole("link", { name: "Entrar al dashboard" }),
    ).toHaveAttribute("href", dashboardUrl);
  });

  test("keeps the primary conversion path usable on a narrow viewport", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 720 });
    await page.goto("/");

    const primaryAction = page.getByRole("link", { name: "Crear mi evento" });
    await expect(primaryAction).toBeVisible();
    await expect(primaryAction).toHaveCSS("min-height", "51.2px");
  });
});
