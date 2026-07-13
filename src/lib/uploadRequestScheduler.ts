export type UploadRequestPermit = () => void;

interface QueuedUploadRequest {
  resolve: (permit: UploadRequestPermit) => void;
  reject: (error: DOMException) => void;
  signals: readonly AbortSignal[];
  onAbort?: () => void;
}

type UploadRequestSignals = AbortSignal | readonly AbortSignal[] | undefined;

function uploadRequestAbortError(): DOMException {
  return new DOMException("Upload request aborted", "AbortError");
}

function isAbortSignal(
  value: AbortSignal | readonly AbortSignal[],
): value is AbortSignal {
  return !Array.isArray(value);
}

function normalizeSignals(
  signals: UploadRequestSignals,
): readonly AbortSignal[] {
  if (!signals) return [];
  return isAbortSignal(signals) ? [signals] : [...signals];
}

function hasAbortedSignal(signals: readonly AbortSignal[]): boolean {
  return signals.some((signal) => signal.aborted);
}

/**
 * FIFO semaphore for the expensive network phase of browser uploads.
 *
 * A scheduler instance can be shared by independent upload flows so their
 * combined PUT/XHR traffic never exceeds the configured browser-wide limit.
 */
export class UploadRequestScheduler {
  private readonly queue: QueuedUploadRequest[] = [];
  private activeRequests = 0;

  constructor(readonly maxConcurrent: number) {
    if (!Number.isInteger(maxConcurrent) || maxConcurrent < 1) {
      throw new RangeError("maxConcurrent must be a positive integer");
    }
  }

  get activeCount(): number {
    return this.activeRequests;
  }

  get pendingCount(): number {
    return this.queue.length;
  }

  acquire(signalsInput?: UploadRequestSignals): Promise<UploadRequestPermit> {
    const signals = normalizeSignals(signalsInput);
    if (hasAbortedSignal(signals)) {
      return Promise.reject(uploadRequestAbortError());
    }

    return new Promise<UploadRequestPermit>((resolve, reject) => {
      const request: QueuedUploadRequest = { resolve, reject, signals };

      if (this.activeRequests < this.maxConcurrent) {
        this.grant(request);
        return;
      }

      request.onAbort = () => {
        const index = this.queue.indexOf(request);
        if (index === -1) return;
        this.queue.splice(index, 1);
        request.signals.forEach((signal) =>
          signal.removeEventListener("abort", request.onAbort!),
        );
        request.reject(uploadRequestAbortError());
      };
      signals.forEach((signal) =>
        signal.addEventListener("abort", request.onAbort!, { once: true }),
      );
      this.queue.push(request);
    });
  }

  async run<T>(
    operation: () => Promise<T> | T,
    signalsInput?: UploadRequestSignals,
  ): Promise<T> {
    const signals = normalizeSignals(signalsInput);
    const release = await this.acquire(signals);
    try {
      if (hasAbortedSignal(signals)) throw uploadRequestAbortError();
      return await operation();
    } finally {
      release();
    }
  }

  private grant(request: QueuedUploadRequest): void {
    if (request.onAbort) {
      request.signals.forEach((signal) =>
        signal.removeEventListener("abort", request.onAbort!),
      );
    }

    if (hasAbortedSignal(request.signals)) {
      request.reject(uploadRequestAbortError());
      this.drain();
      return;
    }

    this.activeRequests += 1;
    let released = false;
    request.resolve(() => {
      if (released) return;
      released = true;
      this.activeRequests -= 1;
      this.drain();
    });
  }

  private drain(): void {
    while (this.activeRequests < this.maxConcurrent && this.queue.length > 0) {
      const request = this.queue.shift();
      if (request) this.grant(request);
    }
  }
}

/** Shared cap across every SharedUploadEngine instance on the page. */
export const sharedUploadRequestScheduler = new UploadRequestScheduler(4);
