import { describe, expect, it, vi } from "vitest";
import { createKeyedAnimationFrameBatcher } from "../../src/lib/animationFrameBatcher";

function createFrameHarness() {
  const callbacks = new Map<number, FrameRequestCallback>();
  let nextHandle = 1;
  const requestFrame = vi.fn((callback: FrameRequestCallback) => {
    const handle = nextHandle;
    nextHandle += 1;
    callbacks.set(handle, callback);
    return handle;
  });
  const cancelFrame = vi.fn((handle: number) => {
    callbacks.delete(handle);
  });
  const runFrame = (handle: number) => {
    const callback = callbacks.get(handle);
    if (!callback) throw new Error(`Missing frame ${handle}`);
    callbacks.delete(handle);
    callback(16);
  };

  return { callbacks, cancelFrame, requestFrame, runFrame };
}

describe("createKeyedAnimationFrameBatcher", () => {
  it("publishes the latest value per key only once in a frame", () => {
    const frames = createFrameHarness();
    const publications: Array<ReadonlyMap<string, number>> = [];
    const batcher = createKeyedAnimationFrameBatcher<string, number>(
      (updates) => publications.push(updates),
      frames,
    );

    batcher.enqueue("photo", 10);
    batcher.enqueue("photo", 22);
    batcher.enqueue("video", 8);

    expect(frames.requestFrame).toHaveBeenCalledOnce();
    expect(publications).toHaveLength(0);
    expect(batcher.pendingCount).toBe(2);

    frames.runFrame(1);

    expect(publications).toHaveLength(1);
    expect([...publications[0].entries()]).toEqual([
      ["photo", 22],
      ["video", 8],
    ]);
    expect(batcher.pendingCount).toBe(0);

    batcher.enqueue("photo", 35);
    expect(frames.requestFrame).toHaveBeenCalledTimes(2);
    frames.runFrame(2);
    expect(publications).toHaveLength(2);
  });

  it("cancels an empty or discarded frame without publishing stale progress", () => {
    const frames = createFrameHarness();
    const publish = vi.fn();
    const batcher = createKeyedAnimationFrameBatcher<string, number>(
      publish,
      frames,
    );

    batcher.enqueue("photo", 44);
    batcher.delete("photo");

    expect(frames.cancelFrame).toHaveBeenCalledWith(1);
    expect(frames.callbacks.size).toBe(0);
    expect(publish).not.toHaveBeenCalled();

    batcher.enqueue("video", 12);
    batcher.cancel();
    expect(frames.cancelFrame).toHaveBeenCalledWith(2);
    expect(frames.callbacks.size).toBe(0);
    expect(batcher.pendingCount).toBe(0);
    expect(publish).not.toHaveBeenCalled();
  });
});
