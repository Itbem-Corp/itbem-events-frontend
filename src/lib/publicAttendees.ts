import { readApiList } from "./apiEnvelope";
import { resolvePublicMediaUrl } from "./mediaUrl";
import { getPresignedUrlExpiry } from "./signedMedia";

export const PUBLIC_ATTENDEE_MEDIA_REFRESH_SKEW_MS = 60 * 1000;

export interface PublicAttendee {
  first_name: string;
  last_name: string;
  nickname?: string;
  role?: string;
  order: number;
  image_url?: string;
  image_view_url?: string;
  image_view_url_expires_at?: string;
  headline?: string;
  bio?: string;
  signature?: string;
}

type AnyRecord = Record<string, unknown>;

function isRecord(value: unknown): value is AnyRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function firstValue(source: AnyRecord, keys: string[]): unknown {
  let blankString: string | undefined;
  for (const key of keys) {
    if (!(key in source) || source[key] === undefined || source[key] === null) continue;
    const value = source[key];
    if (typeof value === "string" && !value.trim()) {
      blankString ??= value;
      continue;
    }
    return value;
  }
  return blankString;
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

function optionalString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

function attendeeMediaUrl(
  value: string | undefined,
  eventsUrl: string | undefined,
): string | undefined {
  if (!value) return undefined;
  const resolved = eventsUrl ? resolvePublicMediaUrl(value, eventsUrl) : value;
  return resolved || undefined;
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

export function normalizePublicAttendee(
  value: unknown,
  fallbackOrder = 0,
  eventsUrl?: string,
): PublicAttendee | null {
  if (!isRecord(value)) return null;

  const firstName = optionalString(
    firstValue(value, ["first_name", "firstName", "FirstName"]),
  );
  const lastName = optionalString(
    firstValue(value, ["last_name", "lastName", "LastName"]),
  );
  const nickname = optionalString(firstValue(value, ["nickname", "Nickname"]));

  if (!firstName && !lastName && !nickname) return null;

  const imageViewUrl = firstOptionalString(value, [
    "image_view_url",
    "imageViewUrl",
    "imageViewURL",
    "ImageViewURL",
    "ImageViewUrl",
    "view_url",
    "viewUrl",
    "viewURL",
    "ViewURL",
    "ViewUrl",
    "url",
    "URL",
  ]);
  const imageUrl = firstOptionalString(value, [
    "image_url",
    "imageUrl",
    "imageURL",
    "ImageURL",
    "ImageUrl",
    "profile_image_url",
    "profileImageUrl",
    "profileImageURL",
    "ProfileImageURL",
    "ProfileImageUrl",
    "avatar_url",
    "avatarUrl",
    "avatarURL",
    "AvatarURL",
    "AvatarUrl",
  ]);
  const imageViewUrlExpiresAt = firstOptionalString(value, [
    "image_view_url_expires_at",
    "imageViewUrlExpiresAt",
    "imageViewURLExpiresAt",
    "ImageViewURLExpiresAt",
    "ImageViewUrlExpiresAt",
    "view_url_expires_at",
    "viewUrlExpiresAt",
    "viewURLExpiresAt",
    "ViewURLExpiresAt",
    "ViewUrlExpiresAt",
  ]);
  const resolvedImageUrl = attendeeMediaUrl(imageUrl, eventsUrl);
  const resolvedImageViewUrl = attendeeMediaUrl(imageViewUrl, eventsUrl);

  return {
    first_name: firstName ?? "",
    last_name: lastName ?? "",
    nickname,
    role: optionalString(firstValue(value, ["role", "Role"])),
    order:
      optionalNumber(
        firstValue(value, [
          "order",
          "Order",
          "public_order",
          "publicOrder",
          "PublicOrder",
          "display_order",
          "displayOrder",
          "DisplayOrder",
          "sort_order",
          "sortOrder",
          "SortOrder",
        ]),
      ) ?? fallbackOrder,
    image_url: resolvedImageUrl,
    image_view_url: resolvedImageViewUrl ?? resolvedImageUrl,
    image_view_url_expires_at: imageViewUrlExpiresAt,
    headline: optionalString(firstValue(value, ["headline", "Headline"])),
    bio: optionalString(firstValue(value, ["bio", "Bio"])),
    signature: optionalString(firstValue(value, ["signature", "Signature"])),
  };
}

export function normalizePublicAttendeesPayload(
  payload: unknown,
  eventsUrl?: string,
): PublicAttendee[] {
  const attendees: Array<{ attendee: PublicAttendee; index: number }> = [];
  readApiList<unknown>(payload).forEach((item, index) => {
    const attendee = normalizePublicAttendee(item, index, eventsUrl);
    if (attendee) attendees.push({ attendee, index });
  });

  return attendees
    .sort((a, b) => a.attendee.order - b.attendee.order || a.index - b.index)
    .map(({ attendee }) => attendee);
}

export function getPublicAttendeeName(attendee: PublicAttendee): string {
  return (
    attendee.nickname?.trim() ||
    `${attendee.first_name} ${attendee.last_name}`.trim()
  );
}

export function publicAttendeeImageUrl(
  attendee: PublicAttendee,
): string | undefined {
  return attendee.image_view_url?.trim() || attendee.image_url;
}

function explicitDate(value: string | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function getPublicAttendeeImageExpiry(
  attendee: PublicAttendee,
): Date | null {
  return (
    explicitDate(attendee.image_view_url_expires_at) ??
    getPresignedUrlExpiry(publicAttendeeImageUrl(attendee))
  );
}

export function getPublicAttendeesCacheExpiresAt(
  attendees: PublicAttendee[],
  cachedAt: number,
  ttlMs: number,
  skewMs = PUBLIC_ATTENDEE_MEDIA_REFRESH_SKEW_MS,
): number {
  const ttlExpiresAt = cachedAt + ttlMs;
  const expiries = attendees
    .map((attendee) => getPublicAttendeeImageExpiry(attendee))
    .filter((expiry): expiry is Date => expiry instanceof Date);

  if (expiries.length === 0) return ttlExpiresAt;
  const mediaExpiresAt = Math.min(
    ...expiries.map((expiry) => expiry.getTime()),
  );
  return Math.min(ttlExpiresAt, mediaExpiresAt - skewMs);
}

export function getPublicAttendeesRefreshDelay(
  attendees: PublicAttendee[],
  now = Date.now(),
  skewMs = PUBLIC_ATTENDEE_MEDIA_REFRESH_SKEW_MS,
): number | null {
  const expiries = attendees
    .map((attendee) => getPublicAttendeeImageExpiry(attendee))
    .filter((expiry): expiry is Date => expiry instanceof Date);

  if (expiries.length === 0) return null;
  const earliest = Math.min(...expiries.map((expiry) => expiry.getTime()));
  return Math.max(0, earliest - now - skewMs);
}

export function publicAttendeesMediaRefreshKey(
  attendees: PublicAttendee[],
): string {
  return attendees
    .map((attendee) =>
      [
        attendee.order,
        getPublicAttendeeName(attendee),
        publicAttendeeImageUrl(attendee) ?? "",
        attendee.image_view_url_expires_at ?? "",
      ].join(":"),
    )
    .join("|");
}

export function hasPublicAttendeeDetails(attendee: PublicAttendee): boolean {
  return Boolean(
    publicAttendeeImageUrl(attendee) ||
    attendee.headline?.trim() ||
    attendee.bio?.trim() ||
    attendee.signature?.trim(),
  );
}
