import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { UploadMediaPreviewCard } from "../../../src/components/UploadMediaPreviewCard";
import {
  PhotoMomentCard,
  UPLOAD_FILE_REQUIRED_MESSAGE,
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
    expect(markup).toContain('aria-required="true"');
    // Review F9: no native `required`, whose bubble points at the hidden
    // input in the browser's language.
    expect(markup).not.toMatch(/\srequired(?:=""|\s|>)/);
    expect(markup).not.toContain("aria-invalid");
  });

  it("marks the hidden file input invalid and links the inline Spanish message", () => {
    const markup = renderToStaticMarkup(
      createElement(UploadFilePicker, {
        inputId: "file-1",
        disabled: false,
        invalid: true,
        describedBy: "file-error",
      }),
    );

    expect(markup).toContain('aria-invalid="true"');
    expect(markup).toContain('aria-describedby="file-error"');
    expect(UPLOAD_FILE_REQUIRED_MESSAGE).toBe("Elige una foto o un video para subir.");
  });

  it("checks for a file in JS and shows the message inline", () => {
    const source = readFileSync(
      fileURLToPath(new URL("../../../src/components/sections/MomentWall.tsx", import.meta.url)),
      "utf8",
    );
    expect(source).toMatch(/if \(!file\) \{\s+setUploadError\(UPLOAD_FILE_REQUIRED_MESSAGE\);\s+fileInput\.focus\(\);/);
    expect(source).toMatch(/<p id=\{uploadErrorId\} role="alert"/);
  });
});
