export interface AnimationFrameBatcherOptions {
  requestFrame?: (callback: FrameRequestCallback) => number;
  cancelFrame?: (handle: number) => void;
}

export interface KeyedAnimationFrameBatcher<Key, Value> {
  enqueue: (key: Key, value: Value) => void;
  delete: (key: Key) => void;
  cancel: () => void;
  readonly pendingCount: number;
}

function frameClock(): number {
  return typeof performance === "undefined" ? Date.now() : performance.now();
}

function fallbackRequestFrame(callback: FrameRequestCallback): number {
  return globalThis.setTimeout(
    () => callback(frameClock()),
    16,
  ) as unknown as number;
}

function fallbackCancelFrame(handle: number): void {
  globalThis.clearTimeout(handle);
}

/**
 * Coalesces values by key and publishes one immutable snapshot per frame.
 * Re-enqueuing a key in the same frame keeps only its latest value.
 */
export function createKeyedAnimationFrameBatcher<Key, Value>(
  publish: (updates: ReadonlyMap<Key, Value>) => void,
  options: AnimationFrameBatcherOptions = {},
): KeyedAnimationFrameBatcher<Key, Value> {
  const nativeFrames =
    typeof globalThis.requestAnimationFrame === "function" &&
    typeof globalThis.cancelAnimationFrame === "function";
  const requestFrame =
    options.requestFrame ??
    (nativeFrames
      ? globalThis.requestAnimationFrame.bind(globalThis)
      : fallbackRequestFrame);
  const cancelFrame =
    options.cancelFrame ??
    (nativeFrames
      ? globalThis.cancelAnimationFrame.bind(globalThis)
      : fallbackCancelFrame);
  const pending = new Map<Key, Value>();
  let frameHandle: number | null = null;

  const flush = () => {
    frameHandle = null;
    if (pending.size === 0) return;
    const snapshot = new Map(pending);
    pending.clear();
    publish(snapshot);
  };

  return {
    enqueue(key, value) {
      pending.set(key, value);
      if (frameHandle === null) {
        frameHandle = requestFrame(flush);
      }
    },
    delete(key) {
      pending.delete(key);
      if (pending.size === 0 && frameHandle !== null) {
        cancelFrame(frameHandle);
        frameHandle = null;
      }
    },
    cancel() {
      pending.clear();
      if (frameHandle !== null) {
        cancelFrame(frameHandle);
        frameHandle = null;
      }
    },
    get pendingCount() {
      return pending.size;
    },
  };
}
