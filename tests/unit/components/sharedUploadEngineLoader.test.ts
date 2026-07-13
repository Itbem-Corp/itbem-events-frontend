import { describe, expect, it, vi } from "vitest";
import { createSharedUploadEngineLoader } from "../../../src/components/shared-upload/loadSharedUploadEngine";

describe("shared upload engine loader", () => {
  it("does not import the engine during loader creation", () => {
    const importer = vi.fn(async () => ({ ready: true }));

    createSharedUploadEngineLoader(importer);

    expect(importer).not.toHaveBeenCalled();
  });

  it("shares one import across repeated intent signals and submit", async () => {
    const engine = { ready: true };
    const importer = vi.fn(async () => engine);
    const loader = createSharedUploadEngineLoader(importer);

    loader.preload();
    loader.preload();
    const firstSubmit = loader.loadForAction();
    const secondSubmit = loader.loadForAction();

    await expect(firstSubmit).resolves.toBe(engine);
    await expect(secondSubmit).resolves.toBe(engine);
    expect(importer).toHaveBeenCalledTimes(1);
  });

  it("retries when a shared speculative import fails during the action", async () => {
    const engine = { ready: true };
    let rejectSpeculative!: (error: Error) => void;
    const speculative = new Promise<typeof engine>((_resolve, reject) => {
      rejectSpeculative = reject;
    });
    const importer = vi
      .fn<() => Promise<typeof engine>>()
      .mockImplementationOnce(() => speculative)
      .mockResolvedValueOnce(engine);
    const loader = createSharedUploadEngineLoader(importer);

    loader.preload();
    const action = loader.loadForAction();
    rejectSpeculative(new Error("temporary chunk failure"));

    await expect(action).resolves.toBe(engine);
    expect(importer).toHaveBeenCalledTimes(2);
  });
});
