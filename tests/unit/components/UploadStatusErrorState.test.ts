import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { UploadStatusErrorState } from "../../../src/components/shared-upload/UploadStatusErrorState";
import { UploadStatusLoadingState } from "../../../src/components/shared-upload/UploadStatusLoadingState";
import { UploadThemeToggle } from "../../../src/components/shared-upload/UploadThemeToggle";

describe("UploadStatusErrorState", () => {
  it("renders an accessible, readable dark error state with a retry action", () => {
    const markup = renderToStaticMarkup(
      createElement(UploadStatusErrorState, {
        theme: "dark",
        kind: "transient",
        retrying: false,
        onRetry: vi.fn(),
      }),
    );

    expect(markup).toContain('role="alert"');
    expect(markup).toContain('aria-labelledby="upload-status-error-title"');
    expect(markup).toContain("text-white");
    expect(markup).toContain("No pudimos comprobar el enlace");
    expect(markup).toContain("Reintentar");
  });

  it("announces and disables the retry action while it is pending", () => {
    const markup = renderToStaticMarkup(
      createElement(UploadStatusErrorState, {
        theme: "light",
        kind: "transient",
        retrying: true,
        onRetry: vi.fn(),
      }),
    );

    expect(markup).toContain('aria-busy="true"');
    expect(markup).toContain("disabled");
    expect(markup).toContain("Reintentando…");
  });

  it("keeps a missing event terminal instead of offering an ineffective retry", () => {
    const markup = renderToStaticMarkup(
      createElement(UploadStatusErrorState, {
        theme: "dark",
        kind: "not-found",
        retrying: false,
      }),
    );

    expect(markup).toContain("No encontramos este evento");
    expect(markup).not.toContain(">Reintentar<");
  });
});

describe("UploadStatusLoadingState", () => {
  it("keeps the file picker behind a polite loading boundary", () => {
    const markup = renderToStaticMarkup(
      createElement(UploadStatusLoadingState, { theme: "dark" }),
    );

    expect(markup).toContain('role="status"');
    expect(markup).toContain('aria-live="polite"');
    expect(markup).toContain("Comprobando el enlace");
  });
});

describe("UploadThemeToggle", () => {
  it("uses an icon-library control with a 44px touch target and explicit label", () => {
    const markup = renderToStaticMarkup(
      createElement(UploadThemeToggle, {
        theme: "dark",
        onToggle: vi.fn(),
      }),
    );

    expect(markup).toContain('aria-label="Cambiar a modo claro"');
    expect(markup).toContain("h-11 w-11");
    expect(markup).toContain("focus-visible:ring-violet-500");
  });
});
