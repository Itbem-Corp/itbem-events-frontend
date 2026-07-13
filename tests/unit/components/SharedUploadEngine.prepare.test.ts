import { afterEach, describe, expect, it, vi } from "vitest";
import { prepareSharedUploadEntries } from "../../../src/components/shared-upload/SharedUploadEngine";

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

describe("shared upload preparation lifecycle", () => {
  it("revokes temporary and preview URLs when preparation is aborted", async () => {
    installPendingVideoElement();
    const createObjectUrl = vi
      .spyOn(URL, "createObjectURL")
      .mockReturnValueOnce("blob:preview")
      .mockReturnValueOnce("blob:metadata");
    const revokeObjectUrl = vi.spyOn(URL, "revokeObjectURL");
    const controller = new AbortController();
    const file = new File(["video"], "clip.mp4", { type: "video/mp4" });

    const preparation = prepareSharedUploadEntries(
      [file],
      controller.signal,
    );
    controller.abort();

    await expect(preparation).rejects.toMatchObject({ name: "AbortError" });
    expect(createObjectUrl).toHaveBeenCalledTimes(2);
    expect(revokeObjectUrl).toHaveBeenCalledWith("blob:metadata");
    expect(revokeObjectUrl).toHaveBeenCalledWith("blob:preview");
  });

  it("treats missing metadata as unknown after a bounded timeout", async () => {
    vi.useFakeTimers();
    installPendingVideoElement();
    vi.spyOn(URL, "createObjectURL")
      .mockReturnValueOnce("blob:preview")
      .mockReturnValueOnce("blob:metadata");
    const revokeObjectUrl = vi.spyOn(URL, "revokeObjectURL");
    const file = new File(["video"], "clip.mp4", { type: "video/mp4" });

    const preparation = prepareSharedUploadEntries([file]);
    await vi.advanceTimersByTimeAsync(5000);

    await expect(preparation).resolves.toMatchObject({
      rejectedVideoEntries: [],
      validEntries: [{ file }],
    });
    expect(revokeObjectUrl).toHaveBeenCalledWith("blob:metadata");
    expect(revokeObjectUrl).not.toHaveBeenCalledWith("blob:preview");
  });
});
