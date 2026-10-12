/** Message type Studio (dashboard) waits for from its preview frame. */
export const PREVIEW_READY_MESSAGE_TYPE = "eventiapp:preview-ready";

interface PreviewReadyWindow {
  parent: unknown;
}

/**
 * Tells the framing Studio that the preview page has rendered. Only for
 * preview pages inside a frame. The payload is the type alone — never tokens
 * or event data — so the "*" target origin leaks nothing (the framing origin
 * is already restricted by frame-ancestors).
 */
export function postPreviewReady(
  win: PreviewReadyWindow & { postMessage?: unknown },
  isPreview: boolean,
): boolean {
  if (!isPreview) return false;
  const parent = win.parent as { postMessage?: (message: unknown, targetOrigin: string) => void } | null;
  if (!parent || parent === win || typeof parent.postMessage !== "function") {
    return false;
  }
  parent.postMessage({ type: PREVIEW_READY_MESSAGE_TYPE }, "*");
  return true;
}
