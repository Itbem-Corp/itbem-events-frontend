import { afterEach, describe, expect, it, vi } from "vitest";
import {
  isSharedUploadVideoDurationAllowed,
  prepareSharedUploadEntries,
  validateSharedUploadVideoDuration,
} from "../../../src/components/shared-upload/SharedUploadEngine";

function installPendingVideoElement(): void {
  vi.stubGlobal("document", {
    createElement: (tag: string) => {
      if (tag !== "video") throw new Error(`Unexpected element: ${tag}`);
      return {
        duration: 0,
        load: vi.fn(),
        onerror: null,
        onloadedmetadata: null,
        preload: "",
        removeAttribute: vi.fn(),
        src: "",
      };
    },
  });
  vi.stubGlobal("window", {
    clearTimeout: globalThis.clearTimeout,
    setTimeout: globalThis.setTimeout,
  });
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("shared upload preparation", () => {
  it("returns video entries at once, flagged validating, without reading metadata", async () => {
    // No document stub: any attempt to create a <video> would throw.
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:preview");
    const photo = new File(["p"], "a.jpg", { type: "image/jpeg" });
    const video = new File(["v"], "clip.mp4", { type: "video/mp4" });

    const { validEntries } = await prepareSharedUploadEntries([video, photo]);

    expect(validEntries.map((entry) => entry.file)).toEqual([photo, video]);
    expect(validEntries[0].validating).toBeUndefined();
    expect(validEntries[1]).toMatchObject({ isVideo: true, validating: true });
  });

  it("rejects without creating entries when already aborted", async () => {
    const createObjectUrl = vi.spyOn(URL, "createObjectURL");
    const controller = new AbortController();
    controller.abort();

    await expect(
      prepareSharedUploadEntries(
        [new File(["v"], "clip.mp4", { type: "video/mp4" })],
        controller.signal,
      ),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(createObjectUrl).not.toHaveBeenCalled();
  });
});

describe("shared upload video duration validation", () => {
  it("revokes its temporary URL when aborted", async () => {
    installPendingVideoElement();
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:metadata");
    const revokeObjectUrl = vi.spyOn(URL, "revokeObjectURL");
    const controller = new AbortController();

    const validation = validateSharedUploadVideoDuration(
      new File(["v"], "clip.mp4", { type: "video/mp4" }),
      controller.signal,
    );
    controller.abort();

    await expect(validation).rejects.toMatchObject({ name: "AbortError" });
    expect(revokeObjectUrl).toHaveBeenCalledWith("blob:metadata");
  });

  it("treats missing metadata as unknown (0) after a bounded timeout", async () => {
    vi.useFakeTimers();
    installPendingVideoElement();
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:metadata");
    const revokeObjectUrl = vi.spyOn(URL, "revokeObjectURL");

    const validation = validateSharedUploadVideoDuration(
      new File(["v"], "clip.mp4", { type: "video/mp4" }),
    );
    await vi.advanceTimersByTimeAsync(5000);

    await expect(validation).resolves.toBe(0);
    expect(revokeObjectUrl).toHaveBeenCalledWith("blob:metadata");
  });

  it("allows up to 5 minutes and unknown duration, rejects longer", () => {
    expect(isSharedUploadVideoDurationAllowed(300)).toBe(true);
    expect(isSharedUploadVideoDurationAllowed(0)).toBe(true);
    expect(isSharedUploadVideoDurationAllowed(300.5)).toBe(false);
  });
});
