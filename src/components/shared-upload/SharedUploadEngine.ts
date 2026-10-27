import {
  buildSharedMomentConfirmUrl,
  buildSharedMomentUploadUrl,
  buildSharedMultipartAbortUrl,
  buildSharedMultipartCompleteUrl,
  buildSharedMultipartStartUrl,
} from "../../lib/apiUrls";
import { isApiFetchError } from "../../lib/apiFetch";
import {
  normalizeCompletedUploadParts,
  requireMomentUploadPresign,
  requireSharedMultipartUploadStart,
  type MomentUploadUrl,
  type SharedMultipartUploadStart,
} from "../../lib/momentUploads";
import { resolveMomentUploadContentType } from "../../lib/momentUploadContentType";
import { optimizeMomentUploadImage } from "../../lib/momentUploadImage";
import {
  classifyPresignedUploadStatus,
  PresignedUploadError,
} from "../../lib/presignedUpload";
import {
  isUploadRateLimitError,
  retryUploadApiOnce,
  retryWhenRateLimited,
} from "../../lib/uploadRetry";
import {
  UPLOAD_CONNECTION_MESSAGE,
  uploadFailureMessage,
} from "../../lib/uploadErrorMessage";
import {
  isVideoUploadFile,
  uploadFileExtension,
} from "../../lib/uploadFilePolicy";
import { createKeyedAnimationFrameBatcher } from "../../lib/animationFrameBatcher";
import { sharedUploadRequestScheduler } from "../../lib/uploadRequestScheduler";
import {
  beginUploadAttempt,
  beginUploadTiming,
  finishUploadTiming,
  uploadTimingFor,
} from "../../lib/uploadTiming";

export const MAX_SHARED_UPLOAD_VIDEO_DURATION_S = 300;

const MULTIPART_THRESHOLD = 10 * 1024 * 1024;
const PART_SIZE = 8 * 1024 * 1024;
const POOL_SIZE = 8;
const PART_CONCURRENCY = 4;
/** Images optimized at once: canvas decodes are heavy on phones. */
export const OPTIMIZE_CONCURRENCY = 2;

type QueryValue = string | number | boolean | null | undefined;
type PublicAccessQuery = Record<string, QueryValue>;

export interface SharedUploadFileEntry {
  id: string;
  file: File;
  previewUrl: string;
  isVideo: boolean;
  isHeic: boolean;
  status: "pending" | "uploading" | "done" | "error";
  errorMsg?: string;
  progress?: number;
  subtitle?: string;
  /** True while the video duration is still being checked in the background. */
  validating?: boolean;
}

export const SHARED_UPLOAD_CONNECTION_ERROR_MESSAGE = UPLOAD_CONNECTION_MESSAGE;

/** Confirm retries: 3 tries, 1 s then 2 s apart, given up after 12 s. */
export const CONFIRM_MAX_ATTEMPTS = 3;
export const CONFIRM_RETRY_BASE_DELAY_MS = 1000;
export const CONFIRM_RETRY_DEADLINE_MS = 12_000;

/** Shown on the thumbnail while the confirm step is retried. */
export function confirmRetrySubtitle(nextAttempt: number, maxAttempts: number): string {
  return `Reintentando… (${nextAttempt} de ${maxAttempts})`;
}

export function normalizeConnectionAbortedEntries(
  entries: SharedUploadFileEntry[],
  abortedEntryIds: ReadonlySet<string>,
): SharedUploadFileEntry[] {
  return entries.map((entry) =>
    abortedEntryIds.has(entry.id) && entry.status === "uploading"
      ? {
          ...entry,
          status: "error" as const,
          errorMsg: SHARED_UPLOAD_CONNECTION_ERROR_MESSAGE,
          progress: undefined,
          subtitle: undefined,
        }
      : entry,
  );
}

export const SHARED_UPLOAD_FORBIDDEN_ENTRY_MESSAGE =
  "No se pudo subir este archivo.";

/**
 * After a 403 the remaining entries were never uploaded; never leave them
 * spinning in "uploading" (PUB-5).
 */
export function releaseForbiddenEntries(
  entries: SharedUploadFileEntry[],
): SharedUploadFileEntry[] {
  return entries.map((entry) =>
    entry.status === "uploading"
      ? {
          ...entry,
          status: "error" as const,
          errorMsg: SHARED_UPLOAD_FORBIDDEN_ENTRY_MESSAGE,
          progress: undefined,
          subtitle: undefined,
        }
      : entry,
  );
}

export function collectConnectionAbortedEntryIds(
  ...groups: ReadonlyArray<Iterable<string>>
): Set<string> {
  return new Set(groups.flatMap((group) => [...group]));
}

export interface PreparedSharedUploadEntries {
  validEntries: SharedUploadFileEntry[];
}

export type SharedUploadApiFetcher = <T>(
  input: RequestInfo | URL,
  init?: RequestInit,
  fallbackMessage?: string,
) => Promise<T>;

export interface SharedUploadBatchOptions {
  eventsUrl: string;
  identifier: string;
  files: SharedUploadFileEntry[];
  description: string;
  descriptionEntryId: string;
  allowMessages: boolean;
  initialUploadedCount: number;
  signal?: AbortSignal;
  fetchUploadApiData: SharedUploadApiFetcher;
  publicAccessQuery: () => PublicAccessQuery;
  publicAccessFetchInit: (init?: RequestInit) => RequestInit | undefined;
  updateFiles: (
    updater: (entries: SharedUploadFileEntry[]) => SharedUploadFileEntry[],
  ) => void;
  onUploadedCount: (count: number) => void;
  onError: (message: string) => void;
  onPublicationResponse: (payload: unknown) => void;
}

export interface SharedUploadBatchResult {
  abortedEarly: boolean;
  connectionError: boolean;
  uploadsDisabled: boolean;
}

function buildEntry(file: File): SharedUploadFileEntry {
  const extension = uploadFileExtension(file);
  const isVideo = isVideoUploadFile(file);
  const isHeic = extension === "heic" || extension === "heif";
  const previewUrl = isHeic ? "heic" : URL.createObjectURL(file);

  const id = crypto.randomUUID();
  // Selection -> visible thumbnail; the page ends this phase (EV-46).
  beginUploadTiming(id, file).start("preview");

  return {
    id,
    file,
    previewUrl,
    isVideo,
    isHeic,
    status: "pending",
  };
}

/** Extract a thumbnail from a video file using a hidden video and canvas. */
export function extractSharedUploadVideoThumbnail(
  blobUrl: string,
): Promise<string> {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "metadata";
    video.src = blobUrl;

    let settled = false;
    const finish = (value: string) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    video.addEventListener(
      "loadeddata",
      () => {
        video.currentTime = Math.min(0.5, video.duration * 0.1);
      },
      { once: true },
    );

    video.addEventListener(
      "seeked",
      () => {
        try {
          const canvas = document.createElement("canvas");
          canvas.width = Math.min(video.videoWidth, 400);
          canvas.height = Math.min(video.videoHeight, 400);
          const context = canvas.getContext("2d");
          if (!context) {
            finish("");
            return;
          }
          context.drawImage(video, 0, 0, canvas.width, canvas.height);
          finish(canvas.toDataURL("image/jpeg", 0.6));
        } catch {
          finish("");
        }
      },
      { once: true },
    );

    video.addEventListener("error", () => finish(""), { once: true });
    window.setTimeout(() => finish(""), 2000);
  });
}

function abortError(): DOMException {
  return new DOMException("Upload preparation aborted", "AbortError");
}

function throwIfSignalAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw abortError();
}

function getVideoDuration(file: File, signal?: AbortSignal): Promise<number> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    const objectUrl = URL.createObjectURL(file);
    let settled = false;
    let timeoutId = 0;
    const cleanup = () => {
      window.clearTimeout(timeoutId);
      signal?.removeEventListener("abort", handleAbort);
      video.removeAttribute("src");
      video.load();
      URL.revokeObjectURL(objectUrl);
    };
    const finish = (duration: number) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(duration);
    };
    const handleAbort = () => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(abortError());
    };

    video.preload = "metadata";
    video.onloadedmetadata = () => finish(video.duration);
    video.onerror = () => finish(0);
    signal?.addEventListener("abort", handleAbort, { once: true });
    timeoutId = window.setTimeout(() => finish(0), 5000);
    video.src = objectUrl;
    if (signal?.aborted) handleAbort();
  });
}

export function isSharedUploadVideoDurationAllowed(duration: number): boolean {
  return duration <= MAX_SHARED_UPLOAD_VIDEO_DURATION_S || duration === 0;
}

/**
 * Builds preview entries without waiting for video metadata (EV-47). Videos
 * come back flagged `validating`; the page checks their duration in the
 * background with validateSharedUploadVideoDuration. Ordering is preserved:
 * non-video entries first, followed by videos.
 */
export async function prepareSharedUploadEntries(
  files: File[],
  signal?: AbortSignal,
): Promise<PreparedSharedUploadEntries> {
  throwIfSignalAborted(signal);
  const entries = files.map(buildEntry).map((entry) =>
    entry.isVideo ? { ...entry, validating: true } : entry,
  );
  return {
    validEntries: [
      ...entries.filter((entry) => !entry.isVideo),
      ...entries.filter((entry) => entry.isVideo),
    ],
  };
}

/** Reads a video's duration in seconds; 0 when unknown (error or 5 s timeout). */
export function validateSharedUploadVideoDuration(
  file: File,
  signal?: AbortSignal,
): Promise<number> {
  return getVideoDuration(file, signal);
}

/** Best-effort HEIC/HEIF conversion for the on-screen preview only. */
export async function convertSharedUploadHeic(
  file: File,
): Promise<File | null> {
  try {
    const bitmap = await createImageBitmap(file, {
      imageOrientation: "from-image",
    });
    const scale = Math.min(1, 2048 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const context = canvas.getContext("2d");
    if (!context) {
      bitmap.close();
      return null;
    }
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    return await new Promise<File | null>((resolve) => {
      canvas.toBlob(
        (blob) =>
          resolve(
            blob
              ? new File([blob], file.name.replace(/\.[^.]+$/, ".jpg"), {
                  type: "image/jpeg",
                })
              : null,
          ),
        "image/jpeg",
        0.85,
      );
    });
  } catch {
    return null;
  }
}

const yieldToBrowser = () =>
  new Promise<void>((resolve) => window.setTimeout(resolve, 0));

export interface WithRetryOptions {
  /** Called before each retry with the attempt about to run (2, 3, …). */
  onRetry?: (nextAttempt: number, maxAttempts: number) => void;
  /**
   * Stop retrying once this many milliseconds have passed since the first
   * attempt, so a struggling backend cannot hold the guest at 95 % for long.
   */
  deadlineMs?: number;
}

export async function withRetry<T>(
  operation: () => Promise<T>,
  maxAttempts = 3,
  baseDelayMs = 1000,
  { onRetry, deadlineMs }: WithRetryOptions = {},
): Promise<T> {
  let lastError: unknown;
  const startedAt = Date.now();
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if ((error as { silent?: boolean }).silent) throw error;
      if ((error as { permanent?: boolean } | null)?.permanent) throw error;
      if (error instanceof Error && error.name === "AbortError") throw error;
      if (error instanceof PresignedUploadError && !error.retryable)
        throw error;
      if (isApiFetchError(error) && error.status >= 400 && error.status < 500) {
        throw error;
      }
      if (error instanceof Error && /\(4\d\d\)/.test(error.message)) {
        throw error;
      }
      if (attempt >= maxAttempts) break;
      const delayMs = baseDelayMs > 0 ? baseDelayMs * 2 ** (attempt - 1) : 0;
      if (
        deadlineMs !== undefined &&
        Date.now() - startedAt + delayMs >= deadlineMs
      ) {
        break;
      }
      onRetry?.(attempt + 1, maxAttempts);
      if (delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }
  throw lastError ?? new Error("withRetry: maxAttempts must be >= 1");
}

export { isUploadRateLimitError, retryWhenRateLimited };

function getAdaptivePoolSize(): number {
  const connection = (
    navigator as unknown as {
      connection?: { effectiveType?: string };
    }
  ).connection;
  if (!connection?.effectiveType) return POOL_SIZE;
  switch (connection.effectiveType) {
    case "slow-2g":
    case "2g":
      return 2;
    case "3g":
      return 4;
    default:
      return POOL_SIZE;
  }
}

/**
 * Parts in flight per multipart upload. Slower links get fewer so each part
 * finishes (and reports progress) instead of all four stalling together; with
 * no `navigator.connection` data (iOS Safari) it stays at PART_CONCURRENCY.
 * The part size stays at the backend's multipartPartSize (8 MB).
 */
export function getPartConcurrency(
  connection?: { effectiveType?: string } | null,
): number {
  switch (connection?.effectiveType) {
    case "slow-2g":
    case "2g":
      return 1;
    case "3g":
      return 2;
    default:
      return PART_CONCURRENCY;
  }
}

/** How long a part may go without a progress event before we explain it. */
export const PROGRESS_STALL_MS = 10_000;

/**
 * Lets at most `max` operations run at once; waiters leave the line as soon as
 * their signal aborts.
 */
export function createConcurrencyLimiter(max: number) {
  let active = 0;
  const waiting: Array<() => void> = [];
  const release = () => {
    const next = waiting.shift();
    if (next) next();
    else active -= 1;
  };
  return async function run<T>(
    operation: () => Promise<T>,
    signal?: AbortSignal,
  ): Promise<T> {
    throwIfSignalAborted(signal);
    if (active >= max) {
      await new Promise<void>((resolve, reject) => {
        const onAbort = () => {
          const index = waiting.indexOf(grant);
          if (index >= 0) waiting.splice(index, 1);
          reject(abortError());
        };
        const grant = () => {
          signal?.removeEventListener("abort", onAbort);
          resolve();
        };
        waiting.push(grant);
        signal?.addEventListener("abort", onAbort, { once: true });
      });
    } else {
      active += 1;
    }
    try {
      return await operation();
    } finally {
      release();
    }
  };
}

async function runPool(
  tasks: Array<() => Promise<void>>,
  concurrency = POOL_SIZE,
): Promise<void> {
  if (tasks.length === 0) return;
  const queue = [...tasks];
  const workers = Array.from(
    { length: Math.min(concurrency, queue.length) },
    async () => {
      while (queue.length > 0) {
        const task = queue.shift();
        if (task) await task();
      }
    },
  );
  await Promise.all(workers);
}

export function calcParts(
  fileSize: number,
  partSize: number,
): Array<{ partNumber: number; start: number; end: number }> {
  const parts: Array<{ partNumber: number; start: number; end: number }> = [];
  let offset = 0;
  let partNumber = 1;
  while (offset < fileSize) {
    const end = Math.min(offset + partSize, fileSize);
    parts.push({ partNumber, start: offset, end });
    offset = end;
    partNumber += 1;
  }
  return parts;
}

/**
 * Upload share of the bar (0–90; confirm owns the last 10). `floor` is the
 * value already shown: a retried part restarts its bytes at 0, and the bar
 * must hold instead of jumping back.
 */
export function calcProgress(
  bytesPerPart: number[],
  totalBytes: number,
  floor = 0,
): number {
  if (totalBytes === 0) return Math.min(90, floor);
  const uploaded = bytesPerPart.reduce((sum, bytes) => sum + bytes, 0);
  return Math.min(
    90,
    Math.max(floor, Math.round((uploaded / totalBytes) * 90)),
  );
}

/**
 * Calls `onStall` when `touch` has not been called for `stallMs`, and
 * `onResume` on the first touch after a stall. One per file, so queue waits,
 * retry backoff and the confirm call are covered, not only an open PUT.
 */
export function createStallWatchdog(
  onStall: () => void,
  onResume: () => void,
  stallMs = PROGRESS_STALL_MS,
) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stalled = false;
  const arm = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      stalled = true;
      onStall();
    }, stallMs);
  };
  return {
    touch() {
      if (stalled) {
        stalled = false;
        onResume();
      }
      arm();
    },
    stop() {
      clearTimeout(timer);
    },
  };
}

function uploadsDisabledError(error: unknown): boolean {
  return isApiFetchError(error) && error.status === 403;
}

function asUploadsDisabledError(): Error & { uploadsDisabled: true } {
  return Object.assign(new Error("uploads-disabled"), {
    uploadsDisabled: true as const,
  });
}

/**
 * Runs per-file compression (overlapping uploads) and presigning, single PUTs, multipart uploads, confirms,
 * retries, and progress updates after the UI has synchronously entered its
 * uploading state.
 */
export async function uploadSharedFiles({
  eventsUrl,
  identifier,
  files,
  description,
  descriptionEntryId,
  allowMessages,
  initialUploadedCount,
  signal,
  fetchUploadApiData,
  publicAccessQuery,
  publicAccessFetchInit,
  updateFiles,
  onUploadedCount,
  onError,
  onPublicationResponse,
}: SharedUploadBatchOptions): Promise<SharedUploadBatchResult> {
  let uploaded = initialUploadedCount;
  let connectionError = false;
  let uploadsDisabled = false;
  const activeRequests = new Map<XMLHttpRequest, string>();
  const scheduledPutRequests = new Map<symbol, string>();
  const inFlightEntryIds = new Set<string>();
  const compressedFiles = new Map<string, File>();
  const connectionQueueAbortController = new AbortController();
  const putQueueSignals = signal
    ? [signal, connectionQueueAbortController.signal]
    : [connectionQueueAbortController.signal];
  const progressBatcher = createKeyedAnimationFrameBatcher<string, number>(
    (updates) => {
      updateFiles((previous) =>
        previous.map((candidate) =>
          updates.has(candidate.id)
            ? { ...candidate, progress: updates.get(candidate.id) }
            : candidate,
        ),
      );
    },
  );

  const publishProgress = (entryId: string, progress: number) => {
    progressBatcher.enqueue(entryId, progress);
  };

  const runScheduledPut = async <T>(
    entryId: string,
    operation: () => Promise<T>,
  ): Promise<T> => {
    const requestKey = Symbol(entryId);
    scheduledPutRequests.set(requestKey, entryId);
    try {
      return await sharedUploadRequestScheduler.run(operation, putQueueSignals);
    } catch (error) {
      if (putQueueSignals.some((candidate) => candidate.aborted)) {
        throw Object.assign(new Error("abort"), { silent: true });
      }
      throw error;
    } finally {
      scheduledPutRequests.delete(requestKey);
    }
  };

  const abortActiveRequestsForConnection = () => {
    const requests = [...activeRequests.entries()];
    const abortedEntryIds = collectConnectionAbortedEntryIds(
      requests.map(([, entryId]) => entryId),
      scheduledPutRequests.values(),
      inFlightEntryIds,
    );
    connectionQueueAbortController.abort();
    activeRequests.clear();
    abortedEntryIds.forEach((entryId) => progressBatcher.delete(entryId));
    updateFiles((previous) =>
      normalizeConnectionAbortedEntries(previous, abortedEntryIds),
    );
    requests.forEach(([request]) => request.abort());
  };

  const trackRequest = (
    request: XMLHttpRequest,
    entryId: string,
  ): (() => void) => {
    activeRequests.set(request, entryId);
    const abort = () => request.abort();
    if (!signal?.aborted) {
      signal?.addEventListener("abort", abort, { once: true });
    }
    return () => {
      activeRequests.delete(request);
      signal?.removeEventListener("abort", abort);
    };
  };

  const uploadMultipart = async (
    entry: SharedUploadFileEntry,
    includeDescription: boolean,
  ): Promise<void> => {
    updateFiles((previous) =>
      previous.map((candidate) =>
        candidate.id === entry.id
          ? { ...candidate, status: "uploading" as const }
          : candidate,
      ),
    );
    const { file } = entry;
    const contentType = resolveMomentUploadContentType(file);
    const timer = uploadTimingFor(entry.id);
    timer.setMultipart();

    let startData: SharedMultipartUploadStart;
    timer.start("presign");
    try {
      startData = await retryWhenRateLimited(
        () =>
          withRetry(() =>
            fetchUploadApiData<SharedMultipartUploadStart>(
              buildSharedMultipartStartUrl(
                eventsUrl,
                identifier,
                publicAccessQuery(),
              ),
              {
                method: "POST",
                signal,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  content_type: contentType,
                  filename: file.name,
                  file_size: file.size,
                }),
              },
              "Error iniciando subida",
            ),
          ),
        signal,
      );
    } catch (error) {
      if (uploadsDisabledError(error)) throw asUploadsDisabledError();
      throw error;
    }

    timer.end("presign");
    const multipart = requireSharedMultipartUploadStart(startData, contentType);
    const uploadId = multipart.uploadId;
    const objectKey = multipart.objectKey;
    const uploadContentType = multipart.contentType;
    const partUrls = multipart.partUrls;

    const abortMultipart = () =>
      fetch(
        buildSharedMultipartAbortUrl(
          eventsUrl,
          identifier,
          publicAccessQuery(),
        ),
        publicAccessFetchInit({
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            upload_id: uploadId,
            object_key: objectKey,
            s3_key: objectKey,
          }),
        }),
      ).catch(() => undefined);

    // What the row says right now, and what it says when nothing moved for
    // PROGRESS_STALL_MS; the watchdog swaps between the two.
    let subtitle: string | undefined;
    let stallMessage =
      "Conexión lenta, seguimos subiendo. No cierres esta pantalla.";
    const showSubtitle = (text: string | undefined) =>
      updateFiles((previous) =>
        previous.map((candidate) =>
          candidate.id === entry.id
            ? { ...candidate, subtitle: text }
            : candidate,
        ),
      );
    const setSubtitle = (text: string | undefined) => {
      subtitle = text;
      showSubtitle(text);
    };
    const watchdog = createStallWatchdog(
      () => showSubtitle(stallMessage),
      () => showSubtitle(subtitle),
    );
    let shownProgress = 0;

    try {
      watchdog.touch();
      const parts = calcParts(file.size, PART_SIZE);
      const bytesUploaded = new Array<number>(parts.length).fill(0);
      const etags = new Array<{ part_number: number; etag: string }>(
        parts.length,
      );

      const uploadPart = async ({
        partNumber,
        start,
        end,
      }: {
        partNumber: number;
        start: number;
        end: number;
      }): Promise<void> => {
        const urlEntry = partUrls.find(
          (candidate) => candidate.part_number === partNumber,
        );
        if (!urlEntry) {
          throw new Error(`No se encontró la URL de la parte ${partNumber}.`);
        }
        const blob = file.slice(start, end);
        setSubtitle(`Subiendo parte ${partNumber}/${parts.length}...`);
        bytesUploaded[partNumber - 1] = 0;
        const etag = await withRetry(
          () =>
          runScheduledPut(
            entry.id,
            () =>
              new Promise<string>((resolve, reject) => {
                bytesUploaded[partNumber - 1] = 0;
                const request = new XMLHttpRequest();
                let settled = false;
                let releaseRequest = () => {};
                const resolveRequest = (value: string) => {
                  if (settled) return;
                  settled = true;
                  releaseRequest();
                  resolve(value);
                };
                const rejectRequest = (error: unknown) => {
                  if (settled) return;
                  settled = true;
                  releaseRequest();
                  reject(error);
                };
                request.open("PUT", urlEntry.url);
                request.timeout = 10 * 60 * 1000;
                request.upload.onprogress = (event) => {
                  if (!event.lengthComputable) return;
                  bytesUploaded[partNumber - 1] = event.loaded;
                  const next = calcProgress(
                    bytesUploaded,
                    file.size,
                    shownProgress,
                  );
                  if (next === shownProgress) return;
                  shownProgress = next;
                  watchdog.touch();
                  publishProgress(entry.id, next);
                };
                request.onload = () => {
                  if (request.status >= 200 && request.status < 300) {
                    const responseEtag =
                      request.getResponseHeader("ETag") ??
                      request.getResponseHeader("etag") ??
                      "";
                    if (!responseEtag) {
                      rejectRequest(
                        Object.assign(
                          // The bucket CORS does not expose ETag: an operator
                          // problem, so guests get plain Spanish copy.
                          new Error(
                            "No pudimos completar la subida de este archivo. Inténtalo de nuevo más tarde.",
                          ),
                          { permanent: true },
                        ),
                      );
                      return;
                    }
                    resolveRequest(responseEtag);
                    return;
                  }
                  const failure = classifyPresignedUploadStatus(request.status);
                  rejectRequest(
                    new PresignedUploadError(
                      `Parte ${partNumber}: ${failure.message}`,
                      failure.kind,
                      failure.retryable,
                      request.status,
                    ),
                  );
                };
                request.onerror = () =>
                  rejectRequest(
                    new TypeError(`Part ${partNumber}: connection error`),
                  );
                request.ontimeout = () =>
                  rejectRequest(new Error(`Part ${partNumber}: timeout`));
                request.onabort = () =>
                  rejectRequest(
                    Object.assign(new Error("abort"), { silent: true }),
                  );
                releaseRequest = trackRequest(request, entry.id);
                if (signal?.aborted) request.abort();
                else request.send(blob);
              }),
          ),
          3,
          1000,
          {
            onRetry: (nextAttempt, maxAttempts) => {
              watchdog.touch();
              setSubtitle(
                `Reintentando parte ${partNumber}/${parts.length} (intento ${nextAttempt} de ${maxAttempts})...`,
              );
            },
          },
        );
        bytesUploaded[partNumber - 1] = end - start;
        etags[partNumber - 1] = {
          part_number: partNumber,
          etag,
        };
      };

      timer.start("put");
      await runPool(
        parts.map((part) => () => uploadPart(part)),
        getPartConcurrency(
          (navigator as unknown as { connection?: { effectiveType?: string } })
            .connection,
        ),
      );
      timer.end("put");
      const completedParts = normalizeCompletedUploadParts(etags);
      if (completedParts.length !== parts.length) {
        throw new Error(
          "No se pudieron confirmar todas las partes de la subida.",
        );
      }

      progressBatcher.delete(entry.id);
      updateFiles((previous) =>
        previous.map((candidate) =>
          candidate.id === entry.id
            ? { ...candidate, progress: 90 }
            : candidate,
        ),
      );
      stallMessage =
        "Seguimos finalizando la subida. No cierres esta pantalla.";
      setSubtitle("Finalizando la subida...");
      watchdog.touch();
      const completeUrl = buildSharedMultipartCompleteUrl(
        eventsUrl,
        identifier,
        publicAccessQuery(),
      );
      const completeOptions: RequestInit = {
        method: "POST",
        signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          upload_id: uploadId,
          object_key: objectKey,
          s3_key: objectKey,
          content_type: uploadContentType,
          file_size: file.size,
          parts: completedParts,
          description:
            allowMessages && includeDescription && description.trim()
              ? description.trim()
              : "",
        }),
      };
      timer.start("confirm");
      const completeResponse = await retryUploadApiOnce(
        () =>
          fetchUploadApiData<unknown>(
            completeUrl,
            completeOptions,
            "Error completando subida",
          ),
        2000,
        signal,
      );
      timer.end("confirm");
      watchdog.stop();
      finishUploadTiming(entry.id, "done");
      onPublicationResponse(completeResponse);
      updateFiles((previous) =>
        previous.map((candidate) =>
          candidate.id === entry.id
            ? {
                ...candidate,
                status: "done" as const,
                progress: 100,
                subtitle: undefined,
              }
            : candidate,
        ),
      );
    } catch (error) {
      watchdog.stop();
      progressBatcher.delete(entry.id);
      if (!(error as { silent?: boolean } | null)?.silent) {
        finishUploadTiming(entry.id, "error");
      }
      void abortMultipart();
      throw error;
    }
  };

  const uploadOne = async (
    entry: SharedUploadFileEntry,
    includeDescription: boolean,
  ): Promise<void> => {
    if (entry.status === "done") {
      uploaded += 1;
      return;
    }

    updateFiles((previous) =>
      previous.map((candidate) =>
        candidate.id === entry.id
          ? { ...candidate, status: "uploading" as const }
          : candidate,
      ),
    );
    const fileToUpload = compressedFiles.get(entry.id) ?? entry.file;
    const effectiveContentType = resolveMomentUploadContentType(fileToUpload);
    const timer = uploadTimingFor(entry.id);

    try {
      let data: MomentUploadUrl;
      timer.start("presign");
      try {
        data = await retryWhenRateLimited(
          () =>
            withRetry(() =>
              fetchUploadApiData<MomentUploadUrl>(
                buildSharedMomentUploadUrl(
                  eventsUrl,
                  identifier,
                  publicAccessQuery(),
                ),
                {
                  method: "POST",
                  signal,
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    content_type: effectiveContentType,
                    filename: fileToUpload.name,
                    file_size: fileToUpload.size,
                  }),
                },
                "Error obteniendo URL",
              ),
            ),
          signal,
        );
      } catch (error) {
        if (uploadsDisabledError(error)) {
          uploadsDisabled = true;
          return;
        }
        throw error;
      }
      timer.end("presign");
      const presign = requireMomentUploadPresign(data, effectiveContentType);
      const uploadUrl = presign.uploadUrl;
      const objectKey = presign.objectKey;
      const uploadContentType = presign.contentType;
      const uploadHeaders = presign.uploadHeaders ?? {};

      timer.start("put");
      await withRetry(
        () =>
          runScheduledPut(entry.id, async () => {
            const request = new XMLHttpRequest();
            let releaseRequest = () => {};
            try {
              await new Promise<void>((resolve, reject) => {
                request.open("PUT", uploadUrl);
                request.setRequestHeader("Content-Type", uploadContentType);
                for (const [name, value] of Object.entries(uploadHeaders)) {
                  request.setRequestHeader(name, value);
                }
                request.timeout = 120_000;
                request.upload.onprogress = (event) => {
                  if (!event.lengthComputable) return;
                  const progress = Math.round(
                    (event.loaded / event.total) * 90,
                  );
                  publishProgress(entry.id, progress);
                };
                request.onload = () => {
                  if (request.status >= 200 && request.status < 300) {
                    resolve();
                    return;
                  }
                  const failure = classifyPresignedUploadStatus(request.status);
                  reject(
                    new PresignedUploadError(
                      failure.message,
                      failure.kind,
                      failure.retryable,
                      request.status,
                    ),
                  );
                };
                request.onerror = () =>
                  reject(
                    new TypeError("Error de conexión al subir el archivo"),
                  );
                request.ontimeout = () =>
                  reject(
                    new Error("La subida tardó demasiado. Revisa tu conexión."),
                  );
                request.onabort = () =>
                  reject(Object.assign(new Error("abort"), { silent: true }));
                releaseRequest = trackRequest(request, entry.id);
                if (signal?.aborted) request.abort();
                else request.send(fileToUpload);
              });
            } finally {
              releaseRequest();
            }
          }),
        3,
        800,
      );
      timer.end("put");

      progressBatcher.delete(entry.id);
      updateFiles((previous) =>
        previous.map((candidate) =>
          candidate.id === entry.id
            ? { ...candidate, progress: 95 }
            : candidate,
        ),
      );
      timer.start("confirm");
      const confirmResponse = await retryWhenRateLimited(() => withRetry(
        () =>
        fetchUploadApiData<unknown>(
          buildSharedMomentConfirmUrl(
            eventsUrl,
            identifier,
            publicAccessQuery(),
          ),
          {
            method: "POST",
            signal,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              object_key: objectKey,
              s3_key: objectKey,
              content_type: uploadContentType,
              file_size: fileToUpload.size,
              description:
                allowMessages && includeDescription && description.trim()
                  ? description.trim()
                  : "",
            }),
          },
          "Error confirmando subida",
        ),
        CONFIRM_MAX_ATTEMPTS,
        CONFIRM_RETRY_BASE_DELAY_MS,
        {
          deadlineMs: CONFIRM_RETRY_DEADLINE_MS,
          onRetry: (nextAttempt, maxAttempts) =>
            updateFiles((previous) =>
              previous.map((candidate) =>
                candidate.id === entry.id
                  ? {
                      ...candidate,
                      subtitle: confirmRetrySubtitle(nextAttempt, maxAttempts),
                    }
                  : candidate,
              ),
            ),
        },
      ), signal);
      timer.end("confirm");
      finishUploadTiming(entry.id, "done");
      onPublicationResponse(confirmResponse);
      updateFiles((previous) =>
        previous.map((candidate) =>
          candidate.id === entry.id
            ? { ...candidate, status: "done" as const, progress: 100 }
            : candidate,
        ),
      );
      uploaded += 1;
      onUploadedCount(uploaded);
    } catch (error) {
      progressBatcher.delete(entry.id);
      if ((error as { silent?: boolean }).silent) return;
      finishUploadTiming(entry.id, "error");
      let message: string;
      if (error instanceof TypeError) {
        message = SHARED_UPLOAD_CONNECTION_ERROR_MESSAGE;
        connectionError = true;
        abortActiveRequestsForConnection();
      } else {
        // Backend confirm/prepare failures arrive in English; guests only
        // see Spanish (PUB-93, STU-57).
        message = uploadFailureMessage(
          error,
          "Ocurrió un error inesperado. Intenta de nuevo.",
        );
      }
      updateFiles((previous) =>
        previous.map((candidate) =>
          candidate.id === entry.id
            ? {
                ...candidate,
                status: "error" as const,
                errorMsg: message,
                subtitle: undefined,
              }
            : candidate,
        ),
      );
      onError(message);
    }
  };

  const pendingEntries = files.filter((entry) => entry.status !== "done");
  // Each file is uploaded as soon as it is optimized, with at most
  // OPTIMIZE_CONCURRENCY optimizations at once. Presign is per file: the batch
  // endpoint needs the final size and type of every file up front.
  const limitOptimization = createConcurrencyLimiter(OPTIMIZE_CONCURRENCY);
  const optimizeEntry = (entry: SharedUploadFileEntry) => {
    // A retried entry gets a fresh timer instead of the half-run previous one.
    const optimizeTimer = beginUploadAttempt(entry.id, entry.file);
    return limitOptimization(async () => {
      optimizeTimer.start("optimize");
      try {
        compressedFiles.set(
          entry.id,
          await optimizeMomentUploadImage(entry.file, {
            maxDimension: 2048,
            quality: 0.86,
            signal,
          }),
        );
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") throw error;
        // Best effort: the original file is uploaded, as before.
      }
      optimizeTimer.end("optimize");
      await yieldToBrowser();
    }, signal);
  };

  const uploadTasks = pendingEntries.map((entry) => async () => {
    if (connectionError || uploadsDisabled || signal?.aborted) return;
    inFlightEntryIds.add(entry.id);
    const includeDescription = entry.id === descriptionEntryId;
    try {
      await optimizeEntry(entry);
      if (entry.isVideo && entry.file.size > MULTIPART_THRESHOLD) {
        await uploadMultipart(entry, includeDescription);
        uploaded += 1;
        onUploadedCount(uploaded);
      } else {
        await uploadOne(entry, includeDescription);
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      if ((error as { silent?: boolean }).silent) return;
      if ((error as { uploadsDisabled?: boolean }).uploadsDisabled) {
        uploadsDisabled = true;
        return;
      }
      if (error instanceof TypeError) {
        connectionError = true;
        abortActiveRequestsForConnection();
        onError(SHARED_UPLOAD_CONNECTION_ERROR_MESSAGE);
      }
      if (entry.isVideo && entry.file.size > MULTIPART_THRESHOLD) {
        // Covers multipart start failures thrown before its own try (no-op if already reported).
        finishUploadTiming(entry.id, "error");
        const message =
          error instanceof Error
            ? error.message
            : "Ocurrió un error inesperado.";
        updateFiles((previous) =>
          previous.map((candidate) =>
            candidate.id === entry.id
              ? {
                  ...candidate,
                  status: "error" as const,
                  errorMsg: message,
                }
              : candidate,
          ),
        );
      }
    } finally {
      inFlightEntryIds.delete(entry.id);
    }
  });
  await runPool(uploadTasks, getAdaptivePoolSize());
  progressBatcher.cancel();
  if (uploadsDisabled) updateFiles(releaseForbiddenEntries);

  return {
    abortedEarly: false,
    connectionError,
    uploadsDisabled,
  };
}
