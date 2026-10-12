import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";

import {
  postPreviewReady,
  PREVIEW_READY_MESSAGE_TYPE,
} from "../../src/lib/previewReadySignal";

describe("Studio preview ready signal", () => {
  it("posts only the message type to the parent of a framed preview", () => {
    const postMessage = vi.fn();
    const win = { parent: { postMessage } };
    expect(postPreviewReady(win, true)).toBe(true);
    expect(postMessage).toHaveBeenCalledTimes(1);
    expect(postMessage).toHaveBeenCalledWith({ type: "eventiapp:preview-ready" }, "*");
    expect(Object.keys(postMessage.mock.calls[0][0])).toEqual(["type"]);
    expect(PREVIEW_READY_MESSAGE_TYPE).toBe("eventiapp:preview-ready");
  });

  it("stays silent outside a frame or outside preview mode", () => {
    const postMessage = vi.fn();
    const topLevel: { parent: unknown; postMessage: typeof postMessage } = { parent: null, postMessage };
    topLevel.parent = topLevel;
    expect(postPreviewReady(topLevel, true)).toBe(false);
    expect(postPreviewReady({ parent: { postMessage } }, false)).toBe(false);
    expect(postMessage).not.toHaveBeenCalled();
  });

  it("is sent by the event page once it has rendered (spec or final error)", () => {
    const source = readFileSync(
      fileURLToPath(new URL("../../src/components/engine/EventPage.tsx", import.meta.url)),
      "utf8",
    );
    expect(source).toContain("postPreviewReady(window, isPreview)");
    expect(source).toContain("if ((!spec && !error) || typeof window === \"undefined\") return;");
  });
});
