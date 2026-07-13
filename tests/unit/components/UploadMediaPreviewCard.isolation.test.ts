import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import {
  UploadMediaPreviewCard,
  areUploadMediaPreviewCardPropsEqual,
  type UploadMediaPreviewCardProps,
} from "../../../src/components/UploadMediaPreviewCard";

const onOpenPreview = vi.fn();
const onRemove = vi.fn();

function cardProps(id: string, progress: number): UploadMediaPreviewCardProps {
  return {
    id,
    fileName: `${id}.jpg`,
    fileSize: 2048,
    previewUrl: `blob:${id}`,
    isVideo: false,
    status: "uploading",
    progress,
    subtitle: "Subiendo",
    uploading: true,
    theme: "dark",
    shouldReduceMotion: false,
    onOpenPreview,
    onRemove,
  };
}

describe("UploadMediaPreviewCard render isolation", () => {
  it("skips an unchanged card when another file receives a progress update", () => {
    const firstBefore = cardProps("first", 20);
    const secondBefore = cardProps("second", 40);
    const firstAfter = { ...firstBefore, progress: 35 };
    const secondAfter = { ...secondBefore };
    const memoRuntime =
      UploadMediaPreviewCard as typeof UploadMediaPreviewCard & {
        compare?: typeof areUploadMediaPreviewCardPropsEqual;
      };

    expect(memoRuntime.compare).toBe(areUploadMediaPreviewCardPropsEqual);
    expect(areUploadMediaPreviewCardPropsEqual(firstBefore, firstAfter)).toBe(
      false,
    );
    expect(areUploadMediaPreviewCardPropsEqual(secondBefore, secondAfter)).toBe(
      true,
    );
  });

  it("keeps preview and remove controls accessible after extraction", () => {
    const props: UploadMediaPreviewCardProps = {
      ...cardProps("photo", 0),
      status: "pending",
      uploading: false,
    };

    const markup = renderToStaticMarkup(
      createElement(UploadMediaPreviewCard, props),
    );

    expect(markup).toContain('aria-haspopup="dialog"');
    expect(markup).toContain('aria-label="Abrir vista previa de photo.jpg"');
    expect(markup).toContain('aria-label="Quitar photo.jpg"');
    expect(markup).toContain('draggable="false"');
  });
});
