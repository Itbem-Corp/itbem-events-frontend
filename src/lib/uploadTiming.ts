/**
 * Per-file timing of the guest upload phases (EV-46).
 *
 * Measures with performance.mark/measure and reports one record per file to a
 * sink. The record never carries file names, guest ids, IPs or URLs: only the
 * phase durations, the file size, a coarse type and a coarse platform.
 * Every entry point swallows its own errors so measuring can never change what
 * the guest sees or how the upload behaves.
 */

export const UPLOAD_TIMING_PHASES = [
  "preview",
  "optimize",
  "presign",
  "put",
  "confirm",
] as const;

export type UploadTimingPhase = (typeof UPLOAD_TIMING_PHASES)[number];
export type UploadTimingKind = "photo" | "heic" | "video" | "other";
export type UploadTimingPlatform = "ios" | "android" | "desktop";
export type UploadTimingOutcome = "done" | "error";

export interface UploadTimingRecord {
  event: "upload_phase_timings";
  platform: UploadTimingPlatform;
  /** True only for Safari on iOS/iPadOS (every iOS browser is WebKit, but only Safari is "ios-safari"). */
  iosSafari: boolean;
  kind: UploadTimingKind;
  sizeBytes: number;
  mimeType: string;
  multipart: boolean;
  outcome: UploadTimingOutcome;
  /** Milliseconds per phase; absent when the phase did not run for this file. */
  phasesMs: Partial<Record<UploadTimingPhase, number>>;
  totalMs: number;
}

export type UploadTimingSink = (record: UploadTimingRecord) => void;

export const UPLOAD_TIMING_EVENT_NAME = "itbem:upload-timing";

export interface UploadTimingFileInfo {
  type: string;
  size: number;
  /** Only the extension is read, to tell HEIC apart; the name is never stored. */
  name?: string;
}

export function classifyUploadPlatform(
  userAgent: string,
  maxTouchPoints = 0,
): { platform: UploadTimingPlatform; iosSafari: boolean } {
  const isIpadOs = /Macintosh/.test(userAgent) && maxTouchPoints > 1;
  const isIos = /iPhone|iPad|iPod/.test(userAgent) || isIpadOs;
  if (isIos) {
    const otherBrowser = /CriOS|FxiOS|EdgiOS|OPiOS|GSA\//.test(userAgent);
    return { platform: "ios", iosSafari: !otherBrowser };
  }
  if (/Android/.test(userAgent)) return { platform: "android", iosSafari: false };
  return { platform: "desktop", iosSafari: false };
}

export function classifyUploadKind(file: UploadTimingFileInfo): UploadTimingKind {
  const type = (file.type || "").toLowerCase();
  const extension = (file.name ?? "").toLowerCase().match(/\.([a-z0-9]+)$/)?.[1];
  if (type.startsWith("video/")) return "video";
  if (
    type === "image/heic" ||
    type === "image/heif" ||
    extension === "heic" ||
    extension === "heif"
  ) {
    return "heic";
  }
  if (type.startsWith("image/")) return "photo";
  if (["mp4", "mov", "m4v", "webm"].includes(extension ?? "")) return "video";
  return "other";
}

/**
 * Default sink: a DOM event any analytics layer can listen to, plus a dev log.
 * Provisional destination: where these records are actually sent (logger,
 * analytics or a backend endpoint) is defined in EV-53.
 */
export const defaultUploadTimingSink: UploadTimingSink = (record) => {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<UploadTimingRecord>(UPLOAD_TIMING_EVENT_NAME, {
      detail: record,
    }),
  );
  if (import.meta.env?.DEV) console.debug("[upload-timing]", record);
};

interface PerformanceLike {
  now(): number;
  mark?(name: string): unknown;
  measure?(name: string, start: string, end: string): unknown;
  clearMarks?(name?: string): void;
  clearMeasures?(name?: string): void;
}

export interface UploadTimingOptions {
  sink?: UploadTimingSink;
  performance?: PerformanceLike;
  userAgent?: string;
  maxTouchPoints?: number;
}

export interface UploadTimer {
  start(phase: UploadTimingPhase): void;
  end(phase: UploadTimingPhase): void;
  /** Marks the file as going through multipart (large videos). */
  setMultipart(): void;
  /** Reports the record once; later calls are ignored. */
  finish(outcome: UploadTimingOutcome): void;
}

const NOOP_TIMER: UploadTimer = {
  start() {},
  end() {},
  setMultipart() {},
  finish() {},
};

let timerSequence = 0;

export function createUploadTimer(
  file: UploadTimingFileInfo,
  options: UploadTimingOptions = {},
): UploadTimer {
  try {
    const perf: PerformanceLike | undefined =
      options.performance ??
      (typeof performance !== "undefined" ? performance : undefined);
    if (!perf) return NOOP_TIMER;

    const sink = options.sink ?? defaultUploadTimingSink;
    const nav = typeof navigator !== "undefined" ? navigator : undefined;
    const { platform, iosSafari } = classifyUploadPlatform(
      options.userAgent ?? nav?.userAgent ?? "",
      options.maxTouchPoints ?? nav?.maxTouchPoints ?? 0,
    );
    const kind = classifyUploadKind(file);
    const sizeBytes = file.size;
    const mimeType = (file.type || "").toLowerCase();
    // Opaque counter, not derived from the file, so marks leak nothing.
    const id = `u${(timerSequence += 1)}`;
    const createdAt = perf.now();
    const startedAt = new Map<UploadTimingPhase, number>();
    const phasesMs: Partial<Record<UploadTimingPhase, number>> = {};
    let multipart = false;
    let finished = false;

    const markName = (phase: UploadTimingPhase, edge: "start" | "end") =>
      `upload:${id}:${phase}:${edge}`;
    const safe = (fn: () => void) => {
      try {
        fn();
      } catch {
        /* measuring must never affect the upload */
      }
    };

    return {
      start(phase) {
        safe(() => {
          if (finished || startedAt.has(phase)) return;
          startedAt.set(phase, perf.now());
          perf.mark?.(markName(phase, "start"));
        });
      },
      end(phase) {
        safe(() => {
          const began = startedAt.get(phase);
          if (finished || began === undefined || phase in phasesMs) return;
          phasesMs[phase] = Math.max(0, Math.round(perf.now() - began));
          perf.mark?.(markName(phase, "end"));
          perf.measure?.(
            `upload:${id}:${phase}`,
            markName(phase, "start"),
            markName(phase, "end"),
          );
        });
      },
      setMultipart() {
        multipart = true;
      },
      finish(outcome) {
        safe(() => {
          if (finished) return;
          finished = true;
          const record: UploadTimingRecord = {
            event: "upload_phase_timings",
            platform,
            iosSafari,
            kind,
            sizeBytes,
            mimeType,
            multipart,
            outcome,
            phasesMs,
            totalMs: Math.max(0, Math.round(perf.now() - createdAt)),
          };
          sink(record);
          for (const phase of UPLOAD_TIMING_PHASES) {
            perf.clearMarks?.(markName(phase, "start"));
            perf.clearMarks?.(markName(phase, "end"));
            perf.clearMeasures?.(`upload:${id}:${phase}`);
          }
        });
      },
    };
  } catch {
    return NOOP_TIMER;
  }
}

const timersByEntry = new Map<string, UploadTimer>();

/** Begins timing a selected file; call at selection time. */
export function beginUploadTiming(
  entryId: string,
  file: UploadTimingFileInfo,
): UploadTimer {
  const timer = createUploadTimer(file);
  timersByEntry.set(entryId, timer);
  return timer;
}

export function uploadTimingFor(entryId: string): UploadTimer {
  return timersByEntry.get(entryId) ?? NOOP_TIMER;
}

export function finishUploadTiming(
  entryId: string,
  outcome: UploadTimingOutcome,
): void {
  const timer = timersByEntry.get(entryId);
  if (!timer) return;
  timersByEntry.delete(entryId);
  timer.finish(outcome);
}

/** Drops a timer without reporting (entry removed before it uploaded). */
export function discardUploadTiming(entryId: string): void {
  timersByEntry.delete(entryId);
}
