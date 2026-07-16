import { readApiData, readApiListPage } from "./apiEnvelope";
import { getPresignedUrlExpiry } from "./signedMedia";

export type PublicMomentProcessingStatus =
  "" | "pending" | "processing" | "done" | "failed";
export type PublicMomentApprovalStatus = "approved" | "pending_review";
export type PublicMomentPublicationStatus =
  "published" | "processing" | "pending_review" | "failed";

export const PUBLIC_MOMENT_MEDIA_REFRESH_SKEW_MS = 60 * 1000;
export const PUBLIC_MOMENTS_LIVE_REFRESH_MS = 30 * 1000;

export interface PublicMoment {
  id: string;
  title?: string;
  content_url: string;
  content_url_expires_at?: string;
  content_view_url?: string;
  content_view_url_expires_at?: string;
  thumbnail_url?: string;
  thumbnail_url_expires_at?: string;
  thumbnail_view_url?: string;
  thumbnail_view_url_expires_at?: string;
  description?: string;
  created_at: string;
  order?: number;
  approval_status?: PublicMomentApprovalStatus;
  publication_status?: PublicMomentPublicationStatus;
  processing_status?: PublicMomentProcessingStatus;
  processing_duration_ms?: number;
  original_size_bytes?: number;
  optimized_size_bytes?: number;
  content_type?: string;
  error_message?: string;
  media_variants?: PublicMediaVariant[];
}

export interface PublicMediaVariant {
  url: string;
  view_url?: string;
  view_url_expires_at?: string;
  width: number;
  format: "webp" | "avif";
  bytes?: number;
}

export interface PublicMomentsPage {
  items: PublicMoment[];
  total?: number;
  page?: number;
  limit?: number;
  has_more?: boolean;
  next_cursor?: string;
  published?: boolean;
  moments_wall_published?: boolean;
  show_moment_wall?: boolean;
  allow_uploads?: boolean;
  allow_messages?: boolean;
  share_uploads_enabled?: boolean;
  uploads_limit?: number;
  uploads_remaining?: number;
  uploads_used?: number;
  event_name?: string;
  event_type?: string;
  event_date?: string;
  event_date_time?: string;
  timezone?: string;
}

interface MergePublicMomentsOptions {
  prependIncoming?: boolean;
  limit?: number;
}

type AnyRecord = Record<string, unknown>;

function isRecord(value: unknown): value is AnyRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function firstValue(source: AnyRecord, keys: string[]): unknown {
  let blankString: string | undefined;
  for (const key of keys) {
    if (!(key in source) || source[key] == null) continue;
    const value = source[key];
    if (typeof value === "string" && !value.trim()) {
      blankString ??= value;
      continue;
    }
    return value;
  }
  return blankString;
}

function recordCandidates(...values: unknown[]): AnyRecord[] {
  const records: AnyRecord[] = [];

  for (const value of values) {
    if (!isRecord(value)) continue;
    if (records.includes(value)) continue;
    records.push(value);
  }

  return records;
}

function hasUsefulPageValue(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === "string") return Boolean(value.trim());
  if (Array.isArray(value)) return value.length > 0;
  if (isRecord(value)) return Object.keys(value).length > 0;
  return true;
}

function hasUsefulPublicMomentsPageData(source: AnyRecord): boolean {
  if (readApiListPage<unknown>(source).items.length > 0) return true;

  return [
    "total",
    "Total",
    "page",
    "Page",
    "limit",
    "Limit",
    "has_more",
    "hasMore",
    "HasMore",
    "next_cursor",
    "nextCursor",
    "NextCursor",
    "published",
    "Published",
    "moments_wall_published",
    "momentsWallPublished",
    "MomentsWallPublished",
    "show_moment_wall",
    "showMomentWall",
    "ShowMomentWall",
    "show_wall",
    "showWall",
    "ShowWall",
    "allow_uploads",
    "allowUploads",
    "AllowUploads",
    "share_uploads_enabled",
    "shareUploadsEnabled",
    "ShareUploadsEnabled",
    "event_name",
    "eventName",
    "EventName",
  ].some((key) => hasUsefulPageValue(source[key]));
}

function optionalString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

function firstOptionalString(
  source: AnyRecord,
  keys: string[],
): string | undefined {
  for (const key of keys) {
    if (!(key in source)) continue;
    const value = optionalString(source[key]);
    if (value) return value;
  }
  return undefined;
}

function stringValue(value: unknown): string {
  return optionalString(value) ?? "";
}

function optionalNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    const parsed = Number(trimmed);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function optionalBoolean(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") return true;
    if (normalized === "false") return false;
  }
  return undefined;
}

function normalizeProcessingStatus(
  value: unknown,
): PublicMomentProcessingStatus | undefined {
  if (typeof value !== "string") return undefined;
  const status = value.trim().toLowerCase();
  if (
    status === "" ||
    status === "pending" ||
    status === "processing" ||
    status === "done" ||
    status === "failed"
  ) {
    return status;
  }
  return undefined;
}

function normalizeApprovalStatus(
  value: unknown,
): PublicMomentApprovalStatus | undefined {
  if (typeof value !== "string") return undefined;
  const status = value.trim().toLowerCase();
  if (status === "approved" || status === "pending_review") return status;
  return undefined;
}

function normalizePublicationStatus(
  value: unknown,
): PublicMomentPublicationStatus | undefined {
  if (typeof value !== "string") return undefined;
  const status = value.trim().toLowerCase();
  if (
    status === "published" ||
    status === "processing" ||
    status === "pending_review" ||
    status === "failed"
  ) {
    return status;
  }
  return undefined;
}

export function normalizePublicMoment(value: unknown): PublicMoment | null {
  if (!isRecord(value)) return null;

  const id = firstOptionalString(value, ["id", "ID", "Id"]);
  if (!id) return null;

  const contentViewUrl = firstOptionalString(value, [
    "content_view_url",
    "contentViewUrl",
    "contentViewURL",
    "ContentViewURL",
    "ContentViewUrl",
    "view_url",
    "viewUrl",
    "viewURL",
    "ViewURL",
    "ViewUrl",
    "url",
    "URL",
    "media_url",
    "mediaUrl",
    "mediaURL",
    "MediaURL",
    "MediaUrl",
  ]);
  const contentUrl =
    firstOptionalString(value, [
      "content_url",
      "contentUrl",
      "contentURL",
      "ContentURL",
      "ContentUrl",
      "path",
      "Path",
      "object_key",
      "objectKey",
      "ObjectKey",
    ]) ?? "";
  const contentViewUrlExpiresAt = firstOptionalString(value, [
    "content_view_url_expires_at",
    "contentViewUrlExpiresAt",
    "contentViewURLExpiresAt",
    "ContentViewURLExpiresAt",
    "ContentViewUrlExpiresAt",
    "view_url_expires_at",
    "viewUrlExpiresAt",
    "viewURLExpiresAt",
    "ViewURLExpiresAt",
    "ViewUrlExpiresAt",
    "url_expires_at",
    "urlExpiresAt",
    "URLExpiresAt",
    "expires_at",
    "expiresAt",
    "ExpiresAt",
  ]);
  const contentUrlExpiresAt = firstOptionalString(value, [
    "content_url_expires_at",
    "contentUrlExpiresAt",
    "contentURLExpiresAt",
    "ContentURLExpiresAt",
    "ContentUrlExpiresAt",
  ]);
  const thumbnailViewUrl = firstOptionalString(value, [
    "thumbnail_view_url",
    "thumbnailViewUrl",
    "thumbnailViewURL",
    "ThumbnailViewURL",
    "ThumbnailViewUrl",
    "poster_url",
    "posterUrl",
    "posterURL",
    "PosterURL",
    "PosterUrl",
  ]);
  const thumbnailUrl = firstOptionalString(value, [
    "thumbnail_url",
    "thumbnailUrl",
    "thumbnailURL",
    "ThumbnailURL",
    "ThumbnailUrl",
    "thumbnail_object_key",
    "thumbnailObjectKey",
    "ThumbnailObjectKey",
  ]);
  const thumbnailViewUrlExpiresAt = firstOptionalString(value, [
    "thumbnail_view_url_expires_at",
    "thumbnailViewUrlExpiresAt",
    "thumbnailViewURLExpiresAt",
    "ThumbnailViewURLExpiresAt",
    "ThumbnailViewUrlExpiresAt",
    "poster_url_expires_at",
    "posterUrlExpiresAt",
    "posterURLExpiresAt",
    "PosterURLExpiresAt",
    "PosterUrlExpiresAt",
  ]);
  const thumbnailUrlExpiresAt = firstOptionalString(value, [
    "thumbnail_url_expires_at",
    "thumbnailUrlExpiresAt",
    "thumbnailURLExpiresAt",
    "ThumbnailURLExpiresAt",
    "ThumbnailUrlExpiresAt",
  ]);
  const mediaVariantsRaw = firstValue(value, [
    "media_variants",
    "mediaVariants",
    "MediaVariants",
  ]);
  const mediaVariants = Array.isArray(mediaVariantsRaw)
    ? mediaVariantsRaw
        .map((variant): PublicMediaVariant | null => {
          if (!isRecord(variant)) return null;
          const url = firstOptionalString(variant, ["url", "URL", "object_key", "objectKey"]);
          const width = optionalNumber(firstValue(variant, ["width", "Width"]));
          const formatValue = firstOptionalString(variant, ["format", "Format"])?.toLowerCase();
          if (!url || !width || (formatValue !== "webp" && formatValue !== "avif")) return null;
          return {
            url,
            view_url: firstOptionalString(variant, ["view_url", "viewUrl", "ViewURL"]),
            view_url_expires_at: firstOptionalString(variant, ["view_url_expires_at", "viewUrlExpiresAt", "ViewURLExpiresAt"]),
            width,
            format: formatValue,
            bytes: optionalNumber(firstValue(variant, ["bytes", "Bytes"])),
          };
        })
        .filter((variant): variant is PublicMediaVariant => variant !== null)
        .sort((left, right) => left.width - right.width)
    : undefined;

  return {
    id,
    title: optionalString(firstValue(value, ["title", "Title"])),
    content_url: contentUrl,
    content_url_expires_at: contentUrlExpiresAt,
    content_view_url: contentViewUrl ?? (contentUrl || undefined),
    content_view_url_expires_at: contentViewUrlExpiresAt ?? contentUrlExpiresAt,
    thumbnail_url: thumbnailUrl,
    thumbnail_url_expires_at: thumbnailUrlExpiresAt,
    thumbnail_view_url: thumbnailViewUrl ?? thumbnailUrl,
    thumbnail_view_url_expires_at:
      thumbnailViewUrlExpiresAt ?? thumbnailUrlExpiresAt,
    description: optionalString(
      firstValue(value, ["description", "Description"]),
    ),
    created_at: stringValue(
      firstValue(value, ["created_at", "createdAt", "CreatedAt"]),
    ),
    order: optionalNumber(firstValue(value, ["order", "Order"])),
    approval_status: normalizeApprovalStatus(
      firstValue(value, [
        "approval_status",
        "approvalStatus",
        "ApprovalStatus",
      ]),
    ),
    publication_status: normalizePublicationStatus(
      firstValue(value, [
        "publication_status",
        "publicationStatus",
        "PublicationStatus",
      ]),
    ),
    processing_status: normalizeProcessingStatus(
      firstValue(value, [
        "processing_status",
        "processingStatus",
        "ProcessingStatus",
      ]),
    ),
    processing_duration_ms: optionalNumber(
      firstValue(value, [
        "processing_duration_ms",
        "processingDurationMs",
        "ProcessingDurationMs",
      ]),
    ),
    original_size_bytes: optionalNumber(
      firstValue(value, [
        "original_size_bytes",
        "originalSizeBytes",
        "OriginalSizeBytes",
      ]),
    ),
    optimized_size_bytes: optionalNumber(
      firstValue(value, [
        "optimized_size_bytes",
        "optimizedSizeBytes",
        "OptimizedSizeBytes",
      ]),
    ),
    content_type: optionalString(
      firstValue(value, ["content_type", "contentType", "ContentType"]),
    ),
    error_message: optionalString(
      firstValue(value, ["error_message", "errorMessage", "ErrorMessage"]),
    ),
    media_variants: mediaVariants?.length ? mediaVariants : undefined,
  };
}

export function normalizePublicMomentUploadResponse(
  value: unknown,
): PublicMoment | null {
  const unwrapped = readApiData<unknown>(value);
  if (isRecord(unwrapped)) {
    const wrappedMoment = firstValue(unwrapped, [
      "public_moment",
      "publicMoment",
      "PublicMoment",
      "moment",
      "Moment",
    ]);
    if (wrappedMoment !== undefined)
      return normalizePublicMoment(wrappedMoment);

    const nested = firstValue(unwrapped, ["data", "Data"]);
    if (isRecord(nested)) return normalizePublicMoment(nested);
  }
  return normalizePublicMoment(unwrapped);
}

export function shouldShowProcessingStub(
  moment: PublicMoment | null | undefined,
): boolean {
  if (!moment) return false;
  return (
    moment.publication_status === "processing" ||
    moment.processing_status === "pending" ||
    moment.processing_status === "processing"
  );
}

export function publicMomentUploadSuccessMessage(
  moment: PublicMoment | null | undefined,
): string {
  if (moment?.publication_status === "published") {
    return "¡Archivo enviado! Ya está disponible en el muro.";
  }
  if (
    moment?.approval_status === "approved" ||
    moment?.publication_status === "processing"
  ) {
    return "¡Archivo enviado! Aparecerá aquí en cuanto termine de procesarse.";
  }
  return "¡Archivo enviado! Aparecerá aquí cuando sea aprobado.";
}

export function normalizePublicMomentsPage(value: unknown): PublicMomentsPage {
  const page = readApiListPage<unknown>(value);
  const root = isRecord(page.data) ? page.data : {};
  const sourceCandidates = recordCandidates(page.source, root.data, root.Data, root);
  const source =
    sourceCandidates.find(hasUsefulPublicMomentsPageData) ??
    sourceCandidates[0] ??
    root;
  const sourcePage = readApiListPage<unknown>(source);
  const itemSource = page.items.length > 0 ? page.items : sourcePage.items;
  const items = itemSource
    .map(normalizePublicMoment)
    .filter((item): item is PublicMoment => item !== null);
  const published = optionalBoolean(firstValue(source, ["published", "Published"]));
  const eventDateTime = optionalString(
    firstValue(source, ["event_date_time", "eventDateTime", "EventDateTime"]),
  );
  const eventDate =
    eventDateTime ??
    optionalString(firstValue(source, ["event_date", "eventDate", "EventDate"]));
  const momentsWallPublished = optionalBoolean(
    firstValue(source, [
      "moments_wall_published",
      "momentsWallPublished",
      "MomentsWallPublished",
      "show_moment_wall",
      "showMomentWall",
      "ShowMomentWall",
      "show_wall",
      "showWall",
      "ShowWall",
    ]),
  );
  let allowUploads = optionalBoolean(
    firstValue(source, ["allow_uploads", "allowUploads", "AllowUploads"]),
  );
  let shareUploadsEnabled = optionalBoolean(
    firstValue(source, [
      "share_uploads_enabled",
      "shareUploadsEnabled",
      "ShareUploadsEnabled",
    ]),
  );
  const effectiveWallPublished = momentsWallPublished ?? published;
  if (
    shareUploadsEnabled === true &&
    allowUploads === undefined &&
    effectiveWallPublished !== true
  ) {
    allowUploads = true;
  }
  if (effectiveWallPublished === true) {
    allowUploads = false;
    shareUploadsEnabled = false;
  }
  if (allowUploads === false) {
    shareUploadsEnabled = false;
  }

  return {
    items,
    total: optionalNumber(firstValue(source, ["total", "Total"])),
    page: optionalNumber(firstValue(source, ["page", "Page"])),
    limit: optionalNumber(firstValue(source, ["limit", "Limit"])),
    has_more: optionalBoolean(
      firstValue(source, ["has_more", "hasMore", "HasMore"]),
    ),
    next_cursor: optionalString(
      firstValue(source, ["next_cursor", "nextCursor", "NextCursor"]),
    ),
    published,
    moments_wall_published: effectiveWallPublished,
    show_moment_wall: effectiveWallPublished,
    allow_uploads: allowUploads,
    allow_messages: optionalBoolean(
      firstValue(source, ["allow_messages", "allowMessages", "AllowMessages"]),
    ),
    share_uploads_enabled: shareUploadsEnabled,
    uploads_limit: optionalNumber(
      firstValue(source, ["uploads_limit", "uploadsLimit", "UploadsLimit"]),
    ),
    uploads_remaining: optionalNumber(
      firstValue(source, [
        "uploads_remaining",
        "uploadsRemaining",
        "UploadsRemaining",
      ]),
    ),
    uploads_used: optionalNumber(
      firstValue(source, ["uploads_used", "uploadsUsed", "UploadsUsed"]),
    ),
    event_name: optionalString(
      firstValue(source, ["event_name", "eventName", "EventName"]),
    ),
    event_type: optionalString(
      firstValue(source, ["event_type", "eventType", "EventType"]),
    ),
    event_date: eventDate,
    event_date_time: eventDateTime ?? eventDate,
    timezone: optionalString(
      firstValue(source, ["timezone", "timeZone", "Timezone", "TimeZone"]),
    ),
  };
}

function explicitDate(value: string | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function getPublicMomentMediaExpiry(moment: PublicMoment): Date | null {
  const expiries = [
    explicitDate(
      moment.content_view_url_expires_at ?? moment.content_url_expires_at,
    ) ?? getPresignedUrlExpiry(publicMomentContentUrl(moment)),
    explicitDate(
      moment.thumbnail_view_url_expires_at ?? moment.thumbnail_url_expires_at,
    ) ?? getPresignedUrlExpiry(publicMomentThumbnailUrl(moment)),
    ...(moment.media_variants ?? []).map(
      (variant) =>
        explicitDate(variant.view_url_expires_at) ??
        getPresignedUrlExpiry(variant.view_url?.trim() || variant.url),
    ),
  ].filter((expiry): expiry is Date => expiry instanceof Date);

  if (expiries.length === 0) return null;
  return new Date(Math.min(...expiries.map((expiry) => expiry.getTime())));
}

export function getPublicMomentsRefreshDelay(
  moments: PublicMoment[],
  now = Date.now(),
  skewMs = PUBLIC_MOMENT_MEDIA_REFRESH_SKEW_MS,
): number | null {
  const expiries = moments
    .map((moment) => getPublicMomentMediaExpiry(moment))
    .filter((expiry): expiry is Date => expiry instanceof Date);

  if (expiries.length === 0) return null;
  const earliest = Math.min(...expiries.map((expiry) => expiry.getTime()));
  return Math.max(0, earliest - now - skewMs);
}

export function publicMomentContentUrl(moment: PublicMoment): string {
  return moment.content_view_url?.trim() || moment.content_url;
}

export function publicMomentThumbnailUrl(
  moment: PublicMoment,
): string | undefined {
  return moment.thumbnail_view_url?.trim() || moment.thumbnail_url;
}

export function publicMomentPreviewUrl(moment: PublicMoment): string {
  return publicMomentThumbnailUrl(moment) || publicMomentContentUrl(moment);
}

export function publicMomentMediaSrcSet(
  moment: PublicMoment,
  resolveUrl: (url: string) => string = (url) => url,
): string | undefined {
  const candidates = (moment.media_variants ?? [])
    .filter((variant) => variant.width > 0 && (variant.view_url || variant.url))
    .map(
      (variant) =>
        `${resolveUrl(variant.view_url?.trim() || variant.url)} ${variant.width}w`,
    );
  return candidates.length ? candidates.join(", ") : undefined;
}

export function mergePublicMomentsById(
  existing: PublicMoment[],
  incoming: PublicMoment[],
  options: MergePublicMomentsOptions = {},
): PublicMoment[] {
  const orderedIds: string[] = [];
  const seen = new Set<string>();
  const orderedSource = options.prependIncoming
    ? [...incoming, ...existing]
    : [...existing, ...incoming];

  for (const moment of orderedSource) {
    if (seen.has(moment.id)) continue;
    seen.add(moment.id);
    orderedIds.push(moment.id);
  }

  const freshest = new Map<string, PublicMoment>();
  for (const moment of existing) freshest.set(moment.id, moment);
  for (const moment of incoming) freshest.set(moment.id, moment);

  const merged = orderedIds
    .map((id) => freshest.get(id))
    .filter((moment): moment is PublicMoment => Boolean(moment));

  if (typeof options.limit === "number" && Number.isFinite(options.limit)) {
    return merged.slice(0, Math.max(0, Math.trunc(options.limit)));
  }
  return merged;
}

export function publicMomentIdsKey(
  moments: Array<Pick<PublicMoment, "id">>,
): string {
  return moments.map((moment) => moment.id).join("|");
}

export function publicMomentsHeadChanged(
  existing: Array<Pick<PublicMoment, "id">>,
  incoming: Array<Pick<PublicMoment, "id">>,
): boolean {
  return (
    publicMomentIdsKey(existing.slice(0, incoming.length)) !==
    publicMomentIdsKey(incoming)
  );
}

export function shouldReplacePublicMomentsOnLiveRefresh(
  previousTotal: number | null | undefined,
  nextTotal: number | null | undefined,
  existing: Array<Pick<PublicMoment, "id">>,
  incoming: Array<Pick<PublicMoment, "id">>,
): boolean {
  if (typeof previousTotal !== "number" || typeof nextTotal !== "number") {
    return false;
  }
  if (nextTotal < previousTotal) return true;
  return (
    nextTotal === previousTotal && publicMomentsHeadChanged(existing, incoming)
  );
}

export function publicMomentsMediaRefreshKey(moments: PublicMoment[]): string {
  return moments
    .map((moment) => {
      const contentUrl = publicMomentContentUrl(moment);
      const thumbnailUrl = publicMomentThumbnailUrl(moment);
      const variants = (moment.media_variants ?? [])
        .map((variant) =>
          [
            variant.width,
            variant.format,
            variant.view_url?.trim() || variant.url,
            variant.view_url_expires_at ?? "",
          ].join(","),
        )
        .join(";");
      return [
        moment.id,
        contentUrl,
        moment.content_view_url_expires_at ??
          moment.content_url_expires_at ??
          "",
        thumbnailUrl ?? "",
        moment.thumbnail_view_url_expires_at ??
          moment.thumbnail_url_expires_at ??
          "",
        variants,
      ].join(":");
    })
    .join("|");
}
