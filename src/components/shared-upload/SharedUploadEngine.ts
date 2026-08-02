import {
  buildSharedMomentBatchUploadUrlsUrl,
  buildSharedMomentConfirmUrl,
  buildSharedMomentUploadUrl,
  buildSharedMultipartAbortUrl,
  buildSharedMultipartCompleteUrl,
  buildSharedMultipartStartUrl,
} from "../../lib/apiUrls";
import { isApiFetchError } from "../../lib/apiFetch";
import {
  mapBatchMomentPresigns,
  normalizeCompletedUploadParts,
  requireMomentUploadPresign,
  requireSharedMultipartUploadStart,
  type CachedMomentPresign,
  type MomentUploadUrl,
  type MomentUploadUrlBatch,
  type SharedMultipartUploadStart,
} from "../../lib/momentUploads";
import { resolveMomentUploadContentType } from "../../lib/momentUploadContentType";
import { optimizeMomentUploadImage } from "../../lib/momentUploadImage";
import {
  classifyPresignedUploadStatus,
  PresignedUploadError,
} from "../../lib/presignedUpload";
import { retryUploadApiOnce } from "../../lib/uploadRetry";
import {
  isVideoUploadFile,
  uploadFileExtension,
} from "../../lib/uploadFilePolicy";
import { createKeyedAnimationFrameBatcher } from "../../lib/animationFrameBatcher";
import { sharedUploadRequestScheduler } from "../../lib/uploadRequestScheduler";

export const MAX_SHARED_UPLOAD_VIDEO_DURATION_S = 300;

const MULTIPART_THRESHOLD = 10 * 1024 * 1024;
const PART_SIZE = 8 * 1024 * 1024;
const POOL_SIZE = 8;
const PART_CONCURRENCY = 4;

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
}

export const SHARED_UPLOAD_CONNECTION_ERROR_MESSAGE =
  "No se pudo conectar al servidor. Verifica tu conexión a internet.";

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

export function collectConnectionAbortedEntryIds(
  ...groups: ReadonlyArray<Iterable<string>>
): Set<string> {
  return new Set(groups.flatMap((group) => [...group]));
}

export interface PreparedSharedUploadEntries {
  validEntries: SharedUploadFileEntry[];
  rejectedVideoEntries: SharedUploadFileEntry[];
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

  return {
    id: crypto.randomUUID(),
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
 * Builds preview entries and rejects videos over five minutes before they are
 * committed to React state. The original ordering behavior is preserved:
 * non-video entries first, followed by accepted videos.
 */
export async function prepareSharedUploadEntries(
  files: File[],
  signal?: AbortSignal,
): Promise<PreparedSharedUploadEntries> {
  throwIfSignalAborted(signal);
  const entries = files.map(buildEntry);
  try {
    const videoEntries = entries.filter((entry) => entry.isVideo);
    const nonVideoEntries = entries.filter((entry) => !entry.isVideo);

    if (videoEntries.length === 0) {
      throwIfSignalAborted(signal);
      return { validEntries: nonVideoEntries, rejectedVideoEntries: [] };
    }

    const videosWithDuration = await Promise.all(
      videoEntries.map(async (entry) => ({
        entry,
        duration: await getVideoDuration(entry.file, signal),
      })),
    );
    throwIfSignalAborted(signal);
    const rejectedVideoEntries = videosWithDuration
      .filter(({ duration }) => !isSharedUploadVideoDurationAllowed(duration))
      .map(({ entry }) => entry);
    const validVideoEntries = videosWithDuration
      .filter(({ duration }) => isSharedUploadVideoDurationAllowed(duration))
      .map(({ entry }) => entry);

    rejectedVideoEntries.forEach((entry) => {
      if (entry.previewUrl && entry.previewUrl !== "heic") {
        URL.revokeObjectURL(entry.previewUrl);
      }
    });

    return {
      validEntries: [...nonVideoEntries, ...validVideoEntries],
      rejectedVideoEntries,
    };
  } catch (error) {
    entries.forEach((entry) => {
      if (entry.previewUrl && entry.previewUrl !== "heic") {
        URL.revokeObjectURL(entry.previewUrl);
      }
    });
    throw error;
  }
}

/** Best-effort HEIC/HEIF conversion for preview and later upload. */
export async function convertSharedUploadHeic(
  file: File,
): Promise<File | null> {
  try {
    const bitmap = await createImageBitmap(file);
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

export async function withRetry<T>(
  operation: () => Promise<T>,
  maxAttempts = 3,
  baseDelayMs = 1000,
): Promise<T> {
  let lastError: unknown;
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
      if (attempt < maxAttempts && baseDelayMs > 0) {
        await new Promise((resolve) =>
          setTimeout(resolve, baseDelayMs * 2 ** (attempt - 1)),
        );
      }
    }
  }
  throw lastError ?? new Error("withRetry: maxAttempts must be >= 1");
}

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

export function calcProgress(
  bytesPerPart: number[],
  totalBytes: number,
): number {
  if (totalBytes === 0) return 0;
  const uploaded = bytesPerPart.reduce((sum, bytes) => sum + bytes, 0);
  return Math.min(90, Math.round((uploaded / totalBytes) * 90));
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
 * Runs compression, batch presigning, single PUTs, multipart uploads, confirms,
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

  const throwIfAborted = () => {
    if (signal?.aborted) {
      throw new DOMException("Upload aborted", "AbortError");
    }
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

    let startData: SharedMultipartUploadStart;
    try {
      startData = await withRetry(() =>
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
      );
    } catch (error) {
      if (uploadsDisabledError(error)) throw asUploadsDisabledError();
      throw error;
    }

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

    try {
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
        updateFiles((previous) =>
          previous.map((candidate) =>
            candidate.id === entry.id
              ? {
                  ...candidate,
                  subtitle: `Subiendo parte ${partNumber}/${parts.length}...`,
                }
              : candidate,
          ),
        );
        bytesUploaded[partNumber - 1] = 0;
        const etag = await withRetry(() =>
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
                  publishProgress(
                    entry.id,
                    calcProgress(bytesUploaded, file.size),
                  );
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
                          new Error(
                            `Part ${partNumber}: S3 no devolvió ETag (configura ExposeHeaders en CORS del bucket)`,
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
        );
        bytesUploaded[partNumber - 1] = end - start;
        etags[partNumber - 1] = {
          part_number: partNumber,
          etag,
        };
      };

      await runPool(
        parts.map((part) => () => uploadPart(part)),
        PART_CONCURRENCY,
      );
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
            ? { ...candidate, progress: 90, subtitle: undefined }
            : candidate,
        ),
      );
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
      onPublicationResponse(completeResponse);
      updateFiles((previous) =>
        previous.map((candidate) =>
          candidate.id === entry.id
            ? { ...candidate, status: "done" as const, progress: 100 }
            : candidate,
        ),
      );
    } catch (error) {
      progressBatcher.delete(entry.id);
      void abortMultipart();
      throw error;
    }
  };

  const uploadOne = async (
    entry: SharedUploadFileEntry,
    includeDescription: boolean,
    cachedPresign?: CachedMomentPresign,
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

    try {
      let uploadUrl: string;
      let objectKey: string;
      let uploadContentType = effectiveContentType;
      let uploadHeaders: Record<string, string> = {};

      if (cachedPresign) {
        uploadUrl = cachedPresign.uploadUrl;
        objectKey = cachedPresign.objectKey;
        uploadContentType = cachedPresign.contentType;
        uploadHeaders = cachedPresign.uploadHeaders ?? {};
      } else {
        let data: MomentUploadUrl;
        try {
          data = await withRetry(() =>
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
          );
        } catch (error) {
          if (uploadsDisabledError(error)) {
            uploadsDisabled = true;
            return;
          }
          throw error;
        }
        const presign = requireMomentUploadPresign(data, effectiveContentType);
        uploadUrl = presign.uploadUrl;
        objectKey = presign.objectKey;
        uploadContentType = presign.contentType;
        uploadHeaders = presign.uploadHeaders ?? {};
      }

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

      progressBatcher.delete(entry.id);
      updateFiles((previous) =>
        previous.map((candidate) =>
          candidate.id === entry.id
            ? { ...candidate, progress: 95 }
            : candidate,
        ),
      );
      const confirmResponse = await withRetry(() =>
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
      );
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
      let message: string;
      if (error instanceof Error && error.name === "AbortError") {
        message = "La subida tardó demasiado. Revisa tu conexión.";
      } else if (error instanceof TypeError) {
        message = SHARED_UPLOAD_CONNECTION_ERROR_MESSAGE;
        connectionError = true;
        abortActiveRequestsForConnection();
      } else if (error instanceof Error) {
        message = error.message;
      } else {
        message = "Ocurrió un error inesperado. Intenta de nuevo.";
      }
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
      onError(message);
    }
  };

  const pendingEntries = files.filter((entry) => entry.status !== "done");
  for (const entry of pendingEntries) {
    throwIfAborted();
    compressedFiles.set(
      entry.id,
      await optimizeMomentUploadImage(entry.file, {
        maxDimension: 2048,
        quality: 0.86,
        signal,
      }),
    );
    throwIfAborted();
    await yieldToBrowser();
  }

  const uploadFileForEntry = (entry: SharedUploadFileEntry) =>
    compressedFiles.get(entry.id) ?? entry.file;
  const uploadContentTypeForEntry = (entry: SharedUploadFileEntry) =>
    resolveMomentUploadContentType(uploadFileForEntry(entry));
  const singleEntries = pendingEntries.filter(
    (entry) => !(entry.isVideo && entry.file.size > MULTIPART_THRESHOLD),
  );
  let presignCache = new Map<string, CachedMomentPresign>();

  if (singleEntries.length > 0 && identifier && !connectionError) {
    try {
      const batchData = await withRetry(async () => {
        try {
          return await fetchUploadApiData<MomentUploadUrlBatch>(
            buildSharedMomentBatchUploadUrlsUrl(
              eventsUrl,
              identifier,
              publicAccessQuery(),
            ),
            {
              method: "POST",
              signal,
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                files: singleEntries.map((entry) => {
                  const uploadFile = uploadFileForEntry(entry);
                  return {
                    content_type: resolveMomentUploadContentType(uploadFile),
                    filename: uploadFile.name,
                    file_size: uploadFile.size,
                  };
                }),
              }),
            },
            "Batch presign failed",
          );
        } catch (error) {
          if (uploadsDisabledError(error)) {
            uploadsDisabled = true;
            return null;
          }
          throw error;
        }
      });
      presignCache =
        mapBatchMomentPresigns(
          singleEntries,
          batchData,
          uploadContentTypeForEntry,
        ) ?? new Map<string, CachedMomentPresign>();
    } catch (error) {
      if (isApiFetchError(error) && error.status >= 400 && error.status < 500) {
        onError(error.message);
        return {
          abortedEarly: true,
          connectionError,
          uploadsDisabled,
        };
      }
    }
  }

  const uploadTasks = pendingEntries.map((entry) => async () => {
    if (connectionError || uploadsDisabled) return;
    inFlightEntryIds.add(entry.id);
    const includeDescription = entry.id === descriptionEntryId;
    try {
      if (entry.isVideo && entry.file.size > MULTIPART_THRESHOLD) {
        await uploadMultipart(entry, includeDescription);
        uploaded += 1;
        onUploadedCount(uploaded);
      } else {
        await uploadOne(entry, includeDescription, presignCache.get(entry.id));
      }
    } catch (error) {
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

  return {
    abortedEarly: false,
    connectionError,
    uploadsDisabled,
  };
}
