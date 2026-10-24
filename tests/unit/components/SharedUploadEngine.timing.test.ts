import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiFetchError } from "../../../src/lib/apiFetch";
import type { SharedUploadFileEntry } from "../../../src/components/shared-upload/SharedUploadEngine";
import type { UploadTimingRecord } from "../../../src/lib/uploadTiming";

/**
 * EV-46: measuring must not change what the guest sees. Every scenario runs
 * the real upload engine twice, once with timing and once with the timing
 * module replaced by no-ops (the engine as it was before EV-46), and compares
 * file states, guest messages, counters and requests.
 */

const TIMING_MODULE = "../../../src/lib/uploadTiming";
const ENGINE_MODULE = "../../../src/components/shared-upload/SharedUploadEngine";
const MB = 1024 * 1024;

interface Scenario {
  files: Array<{ id: string; file: File; isVideo: boolean }>;
  /** Answers fetchUploadApiData by path; throw to simulate an API error. */
  api: (path: string, attempt: number, body: unknown) => unknown;
  /** PUT status per URL and attempt (default 200). */
  putStatus?: (url: string, attempt: number) => number;
}

interface Outcome {
  result: unknown;
  files: Array<Pick<SharedUploadFileEntry, "id" | "status" | "errorMsg" | "progress">>;
  errors: string[];
  uploadedCounts: number[];
  requests: string[];
  records: UploadTimingRecord[];
}

class FakeXhr {
  static putStatus: (url: string, attempt: number) => number = () => 200;
  static attempts = new Map<string, number>();
  static log: string[] = [];
  upload: { onprogress: ((event: ProgressEvent) => void) | null } = { onprogress: null };
  status = 0;
  timeout = 0;
  url = "";
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  ontimeout: (() => void) | null = null;
  onabort: (() => void) | null = null;
  open(_method: string, url: string) {
    this.url = url;
  }
  setRequestHeader() {}
  getResponseHeader(name: string) {
    return name.toLowerCase() === "etag" ? `"etag-${this.url}"` : null;
  }
  abort() {
    this.onabort?.();
  }
  send(body: Blob) {
    const attempt = (FakeXhr.attempts.get(this.url) ?? 0) + 1;
    FakeXhr.attempts.set(this.url, attempt);
    FakeXhr.log.push(`PUT ${this.url} #${attempt}`);
    setTimeout(() => {
      this.status = FakeXhr.putStatus(this.url, attempt);
      this.upload.onprogress?.({
        lengthComputable: true,
        loaded: body.size,
        total: body.size,
      } as ProgressEvent);
      this.onload?.();
    }, 0);
  }
}

function photo(id: string): { id: string; file: File; isVideo: boolean } {
  // GIF skips client optimization, which needs a canvas.
  return { id, file: new File(["gif-bytes"], `${id}.gif`, { type: "image/gif" }), isVideo: false };
}

function video(id: string, sizeBytes: number) {
  return {
    id,
    file: new File([new Uint8Array(sizeBytes)], `${id}.mp4`, { type: "video/mp4" }),
    isVideo: true,
  };
}

async function runScenario(scenario: Scenario, withTiming: boolean): Promise<Outcome> {
  vi.resetModules();
  if (withTiming) {
    vi.doUnmock(TIMING_MODULE);
  } else {
    const noopTimer = { start() {}, end() {}, reset() {}, setMultipart() {}, finish() {} };
    vi.doMock(TIMING_MODULE, () => ({
      beginUploadTiming: () => noopTimer,
      uploadTimingFor: () => noopTimer,
      finishUploadTiming: () => {},
      discardUploadTiming: () => {},
    }));
  }
  const timing = await import(TIMING_MODULE);
  const engine = await import(ENGINE_MODULE);

  const records: UploadTimingRecord[] = [];
  const window = globalThis.window as unknown as EventTarget;
  const listener = (event: Event) =>
    records.push((event as CustomEvent<UploadTimingRecord>).detail);
  window.addEventListener("itbem:upload-timing", listener);

  FakeXhr.putStatus = scenario.putStatus ?? (() => 200);
  FakeXhr.attempts = new Map();
  FakeXhr.log = [];
  const apiAttempts = new Map<string, number>();
  const requests: string[] = [];

  let files: SharedUploadFileEntry[] = scenario.files.map(({ id, file, isVideo }) => {
    timing.beginUploadTiming(id, file).start("preview");
    return { id, file, previewUrl: `blob:${id}`, isVideo, isHeic: false, status: "pending" };
  });
  scenario.files.forEach(({ id }) => timing.uploadTimingFor(id).end("preview"));

  const errors: string[] = [];
  const uploadedCounts: number[] = [];
  try {
    const result = await engine.uploadSharedFiles({
      eventsUrl: "https://api.test",
      identifier: "evt",
      files,
      description: "",
      descriptionEntryId: scenario.files[0].id,
      allowMessages: true,
      initialUploadedCount: 0,
      fetchUploadApiData: async (input: RequestInfo | URL, init?: RequestInit) => {
        const path = new URL(String(input)).pathname.replace(/^.*\/moments\/shared/, "");
        const body = init?.body ? JSON.parse(String(init.body)) : undefined;
        const key = `${path}:${JSON.stringify(body)}`;
        const attempt = (apiAttempts.get(key) ?? 0) + 1;
        apiAttempts.set(key, attempt);
        requests.push(`POST ${path} #${attempt}`);
        return scenario.api(path, attempt, body);
      },
      publicAccessQuery: () => ({}),
      publicAccessFetchInit: (init?: RequestInit) => init,
      updateFiles: (updater) => {
        files = updater(files);
      },
      onUploadedCount: (count) => uploadedCounts.push(count),
      onError: (message) => errors.push(message),
      onPublicationResponse: () => {},
    });
    return {
      result,
      files: files.map(({ id, status, errorMsg, progress }) => ({ id, status, errorMsg, progress })),
      errors,
      uploadedCounts,
      requests: [...requests, ...FakeXhr.log].sort(),
      records,
    };
  } finally {
    window.removeEventListener("itbem:upload-timing", listener);
  }
}

async function expectSameGuestOutcome(scenario: Scenario) {
  const baseline = await runScenario(scenario, false);
  const timed = await runScenario(scenario, true);
  const { records: baselineRecords, ...baselineSeen } = baseline;
  const { records, ...timedSeen } = timed;
  expect(baselineRecords).toEqual([]);
  expect(timedSeen).toEqual(baselineSeen);
  return { seen: timedSeen, records };
}

function presign(id: string) {
  return { upload_url: `https://s3.test/${id}`, object_key: `moments/${id}` };
}

beforeEach(() => {
  const target = new EventTarget();
  vi.stubGlobal(
    "window",
    Object.assign(target, { setTimeout: globalThis.setTimeout.bind(globalThis) }),
  );
  vi.stubGlobal("XMLHttpRequest", FakeXhr);
  vi.stubGlobal("fetch", vi.fn(async () => new Response("{}")));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.doUnmock(TIMING_MODULE);
  vi.resetModules();
});

describe("upload timing does not change the guest upload (EV-46)", () => {
  it("batch of photos with a PUT retry and a confirm retry", async () => {
    const { seen, records } = await expectSameGuestOutcome({
      files: [photo("a"), photo("b"), photo("c")],
      api: (path, attempt, body) => {
        if (path === "/batch-upload-urls") {
          return { urls: [presign("a"), presign("b"), presign("c")] };
        }
        if (path === "/confirm") {
          const key = (body as { object_key: string }).object_key;
          if (key === "moments/c" && attempt === 1) {
            throw new ApiFetchError("temporarily unavailable", 503, null);
          }
          return { id: key };
        }
        throw new Error(`unexpected ${path}`);
      },
      putStatus: (url, attempt) => (url.endsWith("/b") && attempt === 1 ? 503 : 200),
    });

    expect(seen.files.map((file) => file.status)).toEqual(["done", "done", "done"]);
    expect(seen.errors).toEqual([]);
    expect(seen.uploadedCounts).toEqual([1, 2, 3]);
    expect(seen.requests).toContain("PUT https://s3.test/b #2");
    expect(seen.requests).toContain("POST /confirm #2");

    expect(records).toHaveLength(3);
    for (const record of records) {
      expect(record).toMatchObject({ outcome: "done", kind: "photo", multipart: false });
      expect(Object.keys(record.phasesMs).sort()).toEqual(
        ["confirm", "optimize", "presign", "preview", "put"],
      );
      expect(JSON.stringify(record)).not.toMatch(/\.gif|moments\/|s3\.test/);
    }
  }, 20_000);

  it("batch presign without a URL per file falls back to one presign each", async () => {
    const { seen, records } = await expectSameGuestOutcome({
      files: [photo("a"), photo("b")],
      api: (path, _attempt, body) => {
        if (path === "/batch-upload-urls") return { urls: [presign("a")] };
        if (path === "/upload-url") {
          const name = (body as { filename: string }).filename.replace(".gif", "");
          return presign(name);
        }
        if (path === "/confirm") return { ok: true };
        throw new Error(`unexpected ${path}`);
      },
    });

    expect(seen.files.map((file) => file.status)).toEqual(["done", "done"]);
    expect(seen.requests.filter((request) => request.startsWith("POST /upload-url"))).toHaveLength(2);
    expect(records).toHaveLength(2);
    records.forEach((record) => expect(record.phasesMs.presign).toBeGreaterThanOrEqual(0));
  }, 20_000);

  it("multipart video with a part retry, next to a photo in the same batch", async () => {
    const parts = [1, 2, 3].map((part_number) => ({
      part_number,
      url: `https://s3.test/v/part-${part_number}`,
    }));
    const { seen, records } = await expectSameGuestOutcome({
      files: [video("v", 20 * MB), photo("p")],
      api: (path) => {
        if (path === "/batch-upload-urls") return { urls: [presign("p")] };
        if (path === "/multipart/start") {
          return { upload_id: "up-1", object_key: "moments/v", part_urls: parts };
        }
        if (path === "/multipart/complete" || path === "/confirm") return { ok: true };
        throw new Error(`unexpected ${path}`);
      },
      putStatus: (url, attempt) => (url.endsWith("part-2") && attempt === 1 ? 500 : 200),
    });

    expect(seen.files.map((file) => file.status)).toEqual(["done", "done"]);
    expect(seen.errors).toEqual([]);
    expect(seen.requests).toContain("PUT https://s3.test/v/part-2 #2");

    const videoRecord = records.find((record) => record.kind === "video");
    expect(videoRecord).toMatchObject({ multipart: true, outcome: "done", sizeBytes: 20 * MB });
    expect(Object.keys(videoRecord!.phasesMs).sort()).toEqual(
      ["confirm", "optimize", "presign", "preview", "put"],
    );
    expect(records.find((record) => record.kind === "photo")).toMatchObject({
      multipart: false,
      outcome: "done",
    });
  }, 20_000);

  it("a rejected confirm shows the same guest message and reports an error", async () => {
    const { seen, records } = await expectSameGuestOutcome({
      files: [photo("a")],
      api: (path) => {
        if (path === "/batch-upload-urls") return { urls: [presign("a")] };
        if (path === "/confirm") throw new ApiFetchError("object not found", 400, null);
        throw new Error(`unexpected ${path}`);
      },
    });

    expect(seen.files[0].status).toBe("error");
    expect(seen.errors).toHaveLength(1);
    expect(seen.files[0].errorMsg).toBe(seen.errors[0]);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ outcome: "error" });
    expect(records[0].phasesMs.confirm).toBeUndefined();
  }, 20_000);
});
