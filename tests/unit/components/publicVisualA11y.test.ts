import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { UploadMediaPreviewCard } from "../../../src/components/UploadMediaPreviewCard";
import {
  PhotoMomentCard,
  UploadFilePicker,
  momentCardLabel,
} from "../../../src/components/sections/MomentWall";

describe("public visual a11y regressions", () => {
  it("shows a single X (remove) on a failed upload thumbnail and names the error", () => {
    const markup = renderToStaticMarkup(
      createElement(UploadMediaPreviewCard, {
        id: "f1",
        fileName: "foto.jpg",
        fileSize: 2048,
        previewUrl: "blob:f1",
        isVideo: false,
        status: "error",
        errorMsg: "No pudimos verificar la subida.",
        uploading: false,
        theme: "dark",
        shouldReduceMotion: true,
        onOpenPreview: vi.fn(),
        onRemove: vi.fn(),
      }),
    );

    expect(markup.match(/lucide-x\b/g) ?? []).toHaveLength(1);
    expect(markup).toContain("lucide-triangle-alert");
    expect(markup).toContain("Error: No pudimos verificar la subida.");
    expect(markup).toContain('aria-label="Quitar foto.jpg"');
    // QA PUB-N3: the warning sits bottom-left, away from the top-right X.
    const overlay = markup.match(/<div[^>]*data-testid="upload-error-overlay"[^>]*>/)?.[0] ?? "";
    expect(overlay).toContain("items-end");
    expect(overlay).toContain("justify-start");
    expect(markup).toContain("right-0.5 top-0.5");
  });

  it("gives every wall thumbnail button an accessible name", () => {
    const markup = renderToStaticMarkup(
      createElement(PhotoMomentCard, {
        src: "https://cdn.example.com/m.webp",
        position: 2,
        description: null,
        onClick: vi.fn(),
      }),
    );

    expect(markup).toContain('aria-label="Ver foto 2"');
    expect(momentCardLabel("Ver foto 1", "  Brindis  ")).toBe(
      "Ver foto 1: Brindis",
    );
  });

  it("renders the personal upload file picker in Spanish", () => {
    const markup = renderToStaticMarkup(
      createElement(UploadFilePicker, { inputId: "file-1", disabled: false }),
    );

    expect(markup).toContain("Elegir archivo");
    expect(markup).toContain("Ningún archivo seleccionado");
    expect(markup).toContain("sr-only");
    expect(markup).toContain("required");
  });
});
