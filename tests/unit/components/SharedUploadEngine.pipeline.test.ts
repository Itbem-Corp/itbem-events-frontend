import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SharedUploadFileEntry } from "../../../src/components/shared-upload/SharedUploadEngine";

/**
 * EV-48: images are optimized with limited concurrency and each file starts
 * uploading as soon as it is optimized, instead of optimizing all of them first.
 */

const OPTIMIZE_MODULE = "../../../src/lib/momentUploadImage";
const ENGINE_MODULE = "../../../src/components/shared-upload/SharedUploadEngine";

const events: string[] = [];
let activeOptimizations = 0;
let peakOptimizations = 0;
let optimizeImpl: (file: File, signal?: AbortSignal) => Promise<File>;

class FakeXhr {
  upload: { onprogress: unknown } = { onprogress: null };
  status = 200;
  timeout = 0;
  url = "";
  aborted = false;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  ontimeout: (() => void) | null = null;
  onabort: (() => void) | null = null;
  open(_method: string, url: string) {
    this.url = url;
  }
  setRequestHeader() {}
  getResponseHeader() {
    return null;
  }
  abort() {
    this.aborted = true;
    this.onabort?.();
  }
  send() {
    events.push(`put:${this.url.split("/").pop()}`);
    setTimeout(() => {
      if (!this.aborted) this.onload?.();
    }, 0);
  }
}

function entry(id: string): SharedUploadFileEntry {
  return {
    id,
    file: new File(["x"], `${id}.jpg`, { type: "image/jpeg" }),
    previewUrl: `blob:${id}`,
    isVideo: false,
    isHeic: false,
    status: "pending",
  };
}

async function run(ids: string[], signal?: AbortSignal) {
  const engine = await import(ENGINE_MODULE);
  let files = ids.map(entry);
  const result = await engine.uploadSharedFiles({
    eventsUrl: "https://api.test",
    identifier: "evt",
    files,
    description: "",
    descriptionEntryId: ids[0],
    allowMessages: true,
    initialUploadedCount: 0,
    signal,
    fetchUploadApiData: async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = new URL(String(input)).pathname.replace(/^.*\/moments\/shared/, "");
      if (path === "/upload-url") {
        const id = JSON.parse(String(init?.body)).filename.replace(/\..+$/, "");
        events.push(`presign:${id}`);
        return { upload_url: `https://s3.test/${id}`, object_key: `moments/${id}` };
      }
      return { ok: true };
    },
    publicAccessQuery: () => ({}),
    publicAccessFetchInit: (init?: RequestInit) => init,
    updateFiles: (updater: (e: SharedUploadFileEntry[]) => SharedUploadFileEntry[]) => {
      files = updater(files);
    },
    onUploadedCount: () => {},
    onError: () => {},
    onPublicationResponse: () => {},
  });
  return { result, files: () => files };
}

beforeEach(() => {
  events.length = 0;
  activeOptimizations = 0;
  peakOptimizations = 0;
  vi.resetModules();
  vi.doMock(OPTIMIZE_MODULE, () => ({
    optimizeMomentUploadImage: async (file: File, options?: { signal?: AbortSignal }) => {
      const id = file.name.replace(/\..+$/, "");
      events.push(`optimize-start:${id}`);
      activeOptimizations += 1;
      peakOptimizations = Math.max(peakOptimizations, activeOptimizations);
      try {
        return await optimizeImpl(file, options?.signal);
      } finally {
        activeOptimizations -= 1;
        events.push(`optimize-end:${id}`);
      }
    },
  }));
  vi.stubGlobal(
    "window",
    Object.assign(new EventTarget(), { setTimeout: globalThis.setTimeout.bind(globalThis) }),
  );
  vi.stubGlobal("XMLHttpRequest", FakeXhr);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.doUnmock(OPTIMIZE_MODULE);
  vi.resetModules();
});

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("createConcurrencyLimiter", () => {
  it("never runs more than max at once and keeps the queue moving", async () => {
    const { createConcurrencyLimiter } = await import(ENGINE_MODULE);
    const limit = createConcurrencyLimiter(2);
    let active = 0;
    let peak = 0;
    await Promise.all(
      Array.from({ length: 6 }, () =>
        limit(async () => {
          active += 1;
          peak = Math.max(peak, active);
          await sleep(5);
          active -= 1;
        }),
      ),
    );
    expect(peak).toBe(2);
  });

  it("a waiter leaves the line when its signal aborts, without taking a slot", async () => {
    const { createConcurrencyLimiter } = await import(ENGINE_MODULE);
    const limit = createConcurrencyLimiter(1);
    const controller = new AbortController();
    const first = limit(() => sleep(20));
    const ran = vi.fn();
    const waiting = limit(async () => ran(), controller.signal);
    controller.abort();
    await expect(waiting).rejects.toMatchObject({ name: "AbortError" });
    await first;
    expect(ran).not.toHaveBeenCalled();
    // The slot was released: a new operation runs.
    await expect(limit(async () => "ok")).resolves.toBe("ok");
  });
});

describe("optimize + upload pipeline (EV-48)", () => {
  it("starts the first PUT before the last image is optimized, with at most 2 optimizations", async () => {
    optimizeImpl = async (file) => {
      await sleep(file.name.startsWith("a") ? 5 : 30);
      return file;
    };
    const { files } = await run(["a", "b", "c", "d", "e"]);

    expect(peakOptimizations).toBe(2);
    expect(files().map((f) => f.status)).toEqual(Array(5).fill("done"));
    const firstPut = events.findIndex((e) => e.startsWith("put:"));
    const lastOptimizeEnd = events.lastIndexOf("optimize-end:e");
    expect(firstPut).toBeGreaterThan(-1);
    expect(firstPut).toBeLessThan(lastOptimizeEnd);
  });

  it("uploads the original file when optimization fails", async () => {
    optimizeImpl = async () => {
      throw new Error("canvas exploded");
    };
    const { files } = await run(["a", "b"]);

    expect(files().map((f) => f.status)).toEqual(["done", "done"]);
    expect(events.filter((e) => e.startsWith("put:")).sort()).toEqual(["put:a", "put:b"]);
  });

  it("cancelling stops optimizations in progress and uploads still pending", async () => {
    optimizeImpl = (_file, signal) =>
      new Promise((_resolve, reject) => {
        signal?.addEventListener("abort", () =>
          reject(new DOMException("aborted", "AbortError")),
        );
      });
    const controller = new AbortController();
    const pending = run(["a", "b", "c", "d"], controller.signal);
    await sleep(20);
    controller.abort();
    const { files } = await pending;

    expect(events.filter((e) => e.startsWith("optimize-start:"))).toHaveLength(2);
    expect(events.some((e) => e.startsWith("presign:") || e.startsWith("put:"))).toBe(false);
    expect(files().every((f) => f.status !== "done" && f.status !== "error")).toBe(true);
  });
});
