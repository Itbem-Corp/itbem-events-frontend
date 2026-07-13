export interface MomentUploadUrl {
  upload_url?: string;
  uploadUrl?: string;
  UploadURL?: string;
  UploadUrl?: string;
  object_key?: string;
  objectKey?: string;
  ObjectKey?: string;
  s3_key?: string;
  s3Key?: string;
  S3Key?: string;
  content_type?: string;
  contentType?: string;
  ContentType?: string;
  uploads_limit?: number;
  uploadsLimit?: number;
  UploadsLimit?: number;
  uploads_used?: number;
  uploadsUsed?: number;
  UploadsUsed?: number;
  uploads_remaining?: number;
  uploadsRemaining?: number;
  UploadsRemaining?: number;
}

export interface MomentUploadUrlBatch {
  urls?: MomentUploadUrl[];
  URLs?: MomentUploadUrl[];
  Urls?: MomentUploadUrl[];
  uploads_limit?: number;
  uploadsLimit?: number;
  UploadsLimit?: number;
  uploads_used?: number;
  uploadsUsed?: number;
  UploadsUsed?: number;
  uploads_remaining?: number;
  uploadsRemaining?: number;
  UploadsRemaining?: number;
}

export interface PresignedUploadPart {
  part_number?: number | string;
  partNumber?: number | string;
  PartNumber?: number | string;
  url?: string;
  URL?: string;
}

export interface NormalizedPresignedUploadPart {
  part_number: number;
  url: string;
}

export interface CompletedUploadPart {
  part_number: number;
  etag: string;
}

export interface SharedMultipartUploadStart {
  upload_id?: string;
  uploadId?: string;
  UploadID?: string;
  UploadId?: string;
  object_key?: string;
  objectKey?: string;
  ObjectKey?: string;
  s3_key?: string;
  s3Key?: string;
  S3Key?: string;
  part_urls?: PresignedUploadPart[];
  partUrls?: PresignedUploadPart[];
  PartURLs?: PresignedUploadPart[];
  PartUrls?: PresignedUploadPart[];
  content_type?: string;
  contentType?: string;
  ContentType?: string;
  uploads_limit?: number;
  uploadsLimit?: number;
  UploadsLimit?: number;
  uploads_used?: number;
  uploadsUsed?: number;
  UploadsUsed?: number;
  uploads_remaining?: number;
  uploadsRemaining?: number;
  UploadsRemaining?: number;
}

export interface CachedMomentPresign {
  uploadUrl: string;
  objectKey: string;
  contentType: string;
}

export interface CachedSharedMultipartUploadStart {
  uploadId: string;
  objectKey: string;
  contentType: string;
  partUrls: NormalizedPresignedUploadPart[];
}

export const INCOMPLETE_MOMENT_PRESIGN_MESSAGE =
  "Respuesta de subida incompleta del servidor";

function cleanString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function positiveInt(value: unknown): number {
  const numeric =
    typeof value === "string" && value.trim() ? Number(value) : value;
  return typeof numeric === "number" &&
    Number.isInteger(numeric) &&
    numeric > 0
    ? numeric
    : 0;
}

function firstNonEmptyArray<T>(...values: unknown[]): T[] {
  for (const value of values) {
    if (Array.isArray(value) && value.length > 0) return value as T[];
  }
  return [];
}

function readPartNumber(part: PresignedUploadPart): number {
  return (
    positiveInt(part.part_number) ||
    positiveInt(part.partNumber) ||
    positiveInt(part.PartNumber)
  );
}

function readPartUrl(part: PresignedUploadPart): string {
  return cleanString(part.url) || cleanString(part.URL);
}

function readCompletedPartNumber(part: CompletedUploadPart): number {
  const source = part as unknown as Record<string, unknown>;
  return (
    positiveInt(source.part_number) ||
    positiveInt(source.partNumber) ||
    positiveInt(source.PartNumber)
  );
}

function readCompletedPartEtag(part: CompletedUploadPart): string {
  const source = part as unknown as Record<string, unknown>;
  return (
    cleanString(source.etag) ||
    cleanString(source.eTag) ||
    cleanString(source.ETag)
  );
}

function normalizeMultipartPartUrls(
  rawParts: PresignedUploadPart[],
): NormalizedPresignedUploadPart[] {
  const byPartNumber = new Map<number, string>();
  for (const part of rawParts) {
    const partNumber = readPartNumber(part);
    const url = readPartUrl(part);
    if (partNumber <= 0 || !url || byPartNumber.has(partNumber)) continue;
    byPartNumber.set(partNumber, url);
  }
  return [...byPartNumber.entries()]
    .sort(([a], [b]) => a - b)
    .map(([part_number, url]) => ({ part_number, url }));
}

export function normalizeCompletedUploadParts(
  rawParts: Array<CompletedUploadPart | null | undefined>,
): CompletedUploadPart[] {
  const byPartNumber = new Map<number, string>();
  for (const part of rawParts) {
    if (!part) continue;
    const partNumber = readCompletedPartNumber(part);
    const etag = readCompletedPartEtag(part);
    if (
      !Number.isInteger(partNumber) ||
      !partNumber ||
      partNumber <= 0 ||
      !etag ||
      byPartNumber.has(partNumber)
    ) {
      continue;
    }
    byPartNumber.set(partNumber, etag);
  }
  return [...byPartNumber.entries()]
    .sort(([a], [b]) => a - b)
    .map(([part_number, etag]) => ({ part_number, etag }));
}

export function getMomentObjectKey(
  presign: Pick<
    MomentUploadUrl,
    "object_key" | "objectKey" | "ObjectKey" | "s3_key" | "s3Key" | "S3Key"
  >,
): string {
  return (
    cleanString(presign.object_key) ||
    cleanString(presign.objectKey) ||
    cleanString(presign.ObjectKey) ||
    cleanString(presign.s3_key) ||
    cleanString(presign.s3Key) ||
    cleanString(presign.S3Key)
  );
}

export function readMomentUploadPresign(
  presign: MomentUploadUrl | null | undefined,
  fallbackContentType: string,
): CachedMomentPresign | null {
  if (!presign) return null;

  const uploadUrl =
    cleanString(presign.upload_url) ||
    cleanString(presign.uploadUrl) ||
    cleanString(presign.UploadURL) ||
    cleanString(presign.UploadUrl);
  const objectKey = getMomentObjectKey(presign);
  if (!uploadUrl || !objectKey) return null;

  return {
    uploadUrl,
    objectKey,
    contentType:
      cleanString(presign.content_type) ||
      cleanString(presign.contentType) ||
      cleanString(presign.ContentType) ||
      fallbackContentType,
  };
}

export function requireMomentUploadPresign(
  presign: MomentUploadUrl | null | undefined,
  fallbackContentType: string,
): CachedMomentPresign {
  const cached = readMomentUploadPresign(presign, fallbackContentType);
  if (!cached) throw new Error(INCOMPLETE_MOMENT_PRESIGN_MESSAGE);
  return cached;
}

export function toCachedMomentPresign(
  presign: MomentUploadUrl,
  fallbackContentType: string,
): CachedMomentPresign {
  return requireMomentUploadPresign(presign, fallbackContentType);
}

export function requireSharedMultipartUploadStart(
  start: SharedMultipartUploadStart | null | undefined,
  fallbackContentType: string,
): CachedSharedMultipartUploadStart {
  const uploadId =
    cleanString(start?.upload_id) ||
    cleanString(start?.uploadId) ||
    cleanString(start?.UploadID) ||
    cleanString(start?.UploadId);
  const objectKey = start ? getMomentObjectKey(start) : "";
  const rawPartUrls = firstNonEmptyArray<PresignedUploadPart>(
    start?.part_urls,
    start?.partUrls,
    start?.PartURLs,
    start?.PartUrls,
  );
  const partUrls = normalizeMultipartPartUrls(rawPartUrls);

  if (!uploadId || !objectKey || partUrls.length === 0) {
    throw new Error(INCOMPLETE_MOMENT_PRESIGN_MESSAGE);
  }

  return {
    uploadId,
    objectKey,
    contentType:
      cleanString(start?.content_type) ||
      cleanString(start?.contentType) ||
      cleanString(start?.ContentType) ||
      fallbackContentType,
    partUrls,
  };
}

export function mapBatchMomentPresigns<T extends { id: string }>(
  entries: T[],
  response: MomentUploadUrlBatch | null | undefined,
  fallbackContentType: (entry: T) => string,
): Map<string, CachedMomentPresign> | null {
  const urls = firstNonEmptyArray<MomentUploadUrl>(
    response?.urls,
    response?.URLs,
    response?.Urls,
  );
  if (urls.length !== entries.length) {
    return null;
  }
  const cache = new Map<string, CachedMomentPresign>();
  for (let index = 0; index < entries.length; index++) {
    const presign = urls[index];
    const entry = entries[index];
    const cached = readMomentUploadPresign(presign, fallbackContentType(entry));
    if (!cached) return null;
    cache.set(entry.id, cached);
  }
  return cache;
}
