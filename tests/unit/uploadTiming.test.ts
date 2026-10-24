import { describe, expect, it, vi } from "vitest";
import {
  beginUploadAttempt,
  beginUploadTiming,
  classifyUploadKind,
  classifyUploadPlatform,
  createUploadTimer,
  discardUploadTiming,
  finishUploadTiming,
  uploadTimingFor,
  type UploadTimingRecord,
} from "../../src/lib/uploadTiming";

const IPHONE_SAFARI =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1";
const IPHONE_CHROME =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/124.0 Mobile/15E148 Safari/604.1";
const IPHONE_INSTAGRAM =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 330.0.0.0 (iPhone15,2; iOS 17_4; es_MX)";
const ANDROID_CHROME =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/124.0 Mobile Safari/537.36";
const DESKTOP_CHROME =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36";

function fakePerf(times: number[]) {
  let i = 0;
  return {
    now: vi.fn(() => times[Math.min(i++, times.length - 1)]),
    mark: vi.fn(),
    measure: vi.fn(),
    clearMarks: vi.fn(),
    clearMeasures: vi.fn(),
  };
}

describe("classifyUploadPlatform", () => {
  it("tells iOS Safari from other iOS browsers, Android and desktop", () => {
    expect(classifyUploadPlatform(IPHONE_SAFARI)).toEqual({
      platform: "ios",
      iosSafari: true,
    });
    expect(classifyUploadPlatform(IPHONE_CHROME)).toEqual({
      platform: "ios",
      iosSafari: false,
    });
    expect(classifyUploadPlatform(ANDROID_CHROME).platform).toBe("android");
    expect(classifyUploadPlatform(DESKTOP_CHROME).platform).toBe("desktop");
  });

  it("does not count iOS in-app browsers as Safari", () => {
    expect(classifyUploadPlatform(IPHONE_INSTAGRAM)).toEqual({
      platform: "ios",
      iosSafari: false,
    });
  });

  it("treats a touch Macintosh as iPadOS", () => {
    const ipad = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15";
    expect(classifyUploadPlatform(ipad, 5).platform).toBe("ios");
    expect(classifyUploadPlatform(ipad, 0).platform).toBe("desktop");
  });
});

describe("classifyUploadKind", () => {
  it("separates photo, heic, video and other", () => {
    expect(classifyUploadKind({ type: "image/jpeg", size: 1 })).toBe("photo");
    expect(classifyUploadKind({ type: "", size: 1, name: "a.HEIC" })).toBe("heic");
    expect(classifyUploadKind({ type: "image/heif", size: 1 })).toBe("heic");
    expect(classifyUploadKind({ type: "video/quicktime", size: 1 })).toBe("video");
    expect(classifyUploadKind({ type: "application/pdf", size: 1 })).toBe("other");
  });
});

describe("createUploadTimer", () => {
  it("reports per-phase durations with performance marks and no file name", () => {
    const sink = vi.fn();
    const perf = fakePerf([0, 10, 40, 50, 150, 200]);
    const timer = createUploadTimer(
      { type: "image/jpeg", size: 2048, name: "Maria-boda-secret.jpg" },
      { sink, performance: perf, userAgent: IPHONE_SAFARI },
    );

    timer.start("optimize"); // now=10
    timer.end("optimize"); // now=40 -> 30
    timer.start("put"); // now=50
    timer.end("put"); // now=150 -> 100
    timer.finish("done"); // now=200

    expect(sink).toHaveBeenCalledTimes(1);
    const record = sink.mock.calls[0][0] as UploadTimingRecord;
    expect(record).toMatchObject({
      event: "upload_phase_timings",
      platform: "ios",
      iosSafari: true,
      kind: "photo",
      sizeBytes: 2048,
      mimeType: "image/jpeg",
      multipart: false,
      outcome: "done",
      phasesMs: { optimize: 30, put: 100 },
      totalMs: 200,
    });
    expect(JSON.stringify(record)).not.toContain("Maria");
    expect(JSON.stringify(record)).not.toContain(".jpg");
    expect(perf.measure).toHaveBeenCalledTimes(2);
    expect(perf.mark).toHaveBeenCalledWith(expect.stringMatching(/^upload:u\d+:optimize:start$/));
    for (const call of perf.mark.mock.calls) {
      expect(call[0]).not.toContain("Maria");
    }
  });

  it("reports once, ignores unstarted ends and records multipart", () => {
    const sink = vi.fn();
    const timer = createUploadTimer(
      { type: "video/mp4", size: 50_000_000 },
      { sink, performance: fakePerf([0, 5, 10]), userAgent: DESKTOP_CHROME },
    );
    timer.end("confirm");
    timer.setMultipart();
    timer.finish("error");
    timer.finish("done");
    expect(sink).toHaveBeenCalledTimes(1);
    expect(sink.mock.calls[0][0]).toMatchObject({
      kind: "video",
      multipart: true,
      outcome: "error",
      phasesMs: {},
    });
  });

  it("re-measures a phase after reset", () => {
    const sink = vi.fn();
    const timer = createUploadTimer(
      { type: "image/jpeg", size: 1 },
      { sink, performance: fakePerf([0, 10, 500, 600, 650, 700]), userAgent: DESKTOP_CHROME },
    );
    timer.start("presign"); // now=10 (failed batch)
    timer.reset("presign");
    timer.start("presign"); // now=500
    timer.end("presign"); // now=600 -> 100
    timer.finish("done");
    expect(sink.mock.calls[0][0].phasesMs).toEqual({ presign: 100 });
  });

  it("never throws when the sink or performance fail", () => {
    const timer = createUploadTimer(
      { type: "image/png", size: 1 },
      {
        sink: () => {
          throw new Error("sink down");
        },
        performance: {
          now: () => 0,
          mark: () => {
            throw new Error("no marks");
          },
        },
      },
    );
    expect(() => {
      timer.start("preview");
      timer.end("preview");
      timer.finish("done");
    }).not.toThrow();
  });
});

describe("entry registry", () => {
  it("dispatches a DOM event on finish and forgets discarded entries", () => {
    const events: UploadTimingRecord[] = [];
    const listener = (event: Event) =>
      events.push((event as CustomEvent<UploadTimingRecord>).detail);
    const target = new EventTarget();
    vi.stubGlobal("window", target);
    vi.stubGlobal("CustomEvent", class extends Event {
      detail: unknown;
      constructor(type: string, init?: { detail?: unknown }) {
        super(type);
        this.detail = init?.detail;
      }
    });
    target.addEventListener("itbem:upload-timing", listener);
    try {
      beginUploadTiming("a", { type: "image/jpeg", size: 9 }).start("preview");
      finishUploadTiming("a", "done");
      finishUploadTiming("a", "done"); // already forgotten
      beginUploadTiming("b", { type: "image/jpeg", size: 9 });
      discardUploadTiming("b");
      finishUploadTiming("b", "done");
      expect(events).toHaveLength(1);
      expect(events[0].outcome).toBe("done");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("keeps the selection timer for the first attempt and starts fresh on a retry", () => {
    const first = beginUploadTiming("r", { type: "image/jpeg", size: 9 });
    expect(beginUploadAttempt("r", { type: "image/jpeg", size: 9 })).toBe(first);
    // Second attempt after a silent abort: the half-run timer is replaced.
    const retry = beginUploadAttempt("r", { type: "image/jpeg", size: 9 });
    expect(retry).not.toBe(first);
    expect(uploadTimingFor("r")).toBe(retry);
    // Retry after the entry finished with an error: a new timer, not a no-op.
    finishUploadTiming("r", "error");
    const afterError = beginUploadAttempt("r", { type: "image/jpeg", size: 9 });
    expect(uploadTimingFor("r")).toBe(afterError);
    discardUploadTiming("r");
  });
});

describe("discard and failing sinks", () => {
  it("clears marks on discard and when the sink throws", () => {
    const perf = fakePerf([0, 1, 2, 3]);
    const throwing = createUploadTimer(
      { type: "image/jpeg", size: 1 },
      { sink: () => { throw new Error("sink down"); }, performance: perf, userAgent: DESKTOP_CHROME },
    );
    throwing.start("put");
    throwing.finish("done");
    expect(perf.clearMarks).toHaveBeenCalledWith(expect.stringMatching(/:put:start$/));

    const sink = vi.fn();
    const discardPerf = fakePerf([0, 1]);
    const discarded = createUploadTimer(
      { type: "image/jpeg", size: 1 },
      { sink, performance: discardPerf, userAgent: DESKTOP_CHROME },
    );
    discarded.start("put");
    discarded.discard();
    discarded.finish("done");
    expect(sink).not.toHaveBeenCalled();
    expect(discardPerf.clearMarks).toHaveBeenCalledWith(expect.stringMatching(/:put:start$/));
  });
});
