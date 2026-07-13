import type { PageSpec } from "../components/engine/types";
import { readApiData } from "./apiEnvelope";
import { getPresignedUrlExpiry } from "./signedMedia";
import { cacheTokenHash } from "./tokenHash";

export type PageSpecCacheMode = "token" | "identifier";

export const TOKEN_PAGE_SPEC_CACHE_TTL_MS = 5 * 60 * 1000;
export const IDENTIFIER_PAGE_SPEC_CACHE_TTL_MS = 30 * 1000;
export const PAGE_SPEC_SIGNED_MEDIA_CACHE_SKEW_MS = 60 * 1000;

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

interface CachedPageSpec {
  spec: PageSpec;
  ts: number;
}

type AnyRecord = Record<string, unknown>;

function isRecord(value: unknown): value is AnyRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function firstValue(source: AnyRecord, keys: string[]): unknown {
  let blankString: string | undefined;

  for (const key of keys) {
    if (!(key in source)) continue;
    const value = source[key];
    if (value === undefined || value === null) continue;
    if (typeof value === "string" && !value.trim()) {
      blankString ??= value;
      continue;
    }
    return value;
  }

  return blankString;
}

function firstRecord(source: AnyRecord, keys: string[]): AnyRecord | null {
  const value = firstValue(source, keys);
  return isRecord(value) ? value : null;
}

function firstArray(source: AnyRecord, keys: string[]): unknown[] | null {
  let emptyArray: unknown[] | null = null;

  for (const key of keys) {
    if (!(key in source)) continue;
    const value = source[key];
    if (!Array.isArray(value)) continue;
    if (value.length > 0) return value;
    emptyArray ??= value;
  }

  return emptyArray;
}

function optionalString(value: unknown): string | undefined {
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return value.toISOString();
  }
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

function optionalAccessDateString(value: unknown): string | undefined {
  const date = optionalString(value);
  if (!date || date.startsWith("0001-")) return undefined;
  return date;
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

function firstDefinedValue(source: AnyRecord, keys: string[]): unknown {
  let blankString: string | undefined;

  for (const key of keys) {
    const value = source[key];
    if (value === undefined || value === null) continue;
    if (typeof value === "string" && !value.trim()) {
      blankString ??= value;
      continue;
    }
    return value;
  }

  return blankString;
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

function optionalStringMap(value: unknown): Record<string, string> | undefined {
  if (!isRecord(value)) return undefined;
  const entries = Object.entries(value)
    .map(([key, rawValue]) => [key, optionalString(rawValue)] as const)
    .filter((entry): entry is [string, string] => Boolean(entry[1]));
  return entries.length ? Object.fromEntries(entries) : undefined;
}

function normalizeThemeMapKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

function optionalThemeStringMap(
  value: unknown,
): Record<string, string> | undefined {
  const entries = Object.entries(optionalStringMap(value) ?? {})
    .map(([key, mapValue]) => [normalizeThemeMapKey(key), mapValue] as const)
    .filter((entry): entry is [string, string] => Boolean(entry[0]));
  return entries.length ? Object.fromEntries(entries) : undefined;
}

function mergeThemeStringMaps(
  base: Record<string, string> | undefined,
  override: Record<string, string> | undefined,
): Record<string, string> | undefined {
  const merged = { ...(base ?? {}), ...(override ?? {}) };
  return Object.keys(merged).length ? merged : undefined;
}

function firstRecordFromAliases(
  source: AnyRecord | null | undefined,
  keys: string[],
): AnyRecord | null {
  if (!source) return null;
  for (const key of keys) {
    const value = source[key];
    if (isRecord(value)) return value;
  }
  return null;
}

function firstRecordFromSources(
  sources: Array<AnyRecord | null | undefined>,
  keys: string[],
): AnyRecord | null {
  for (const source of sources) {
    const record = firstRecordFromAliases(source, keys);
    if (record) return record;
  }
  return null;
}

function firstOptionalStringFromSources(
  sources: Array<AnyRecord | null | undefined>,
  keys: string[],
): string | undefined {
  for (const source of sources) {
    if (!source) continue;
    const value = firstOptionalString(source, keys);
    if (value) return value;
  }
  return undefined;
}

function themePatternKey(pattern: AnyRecord): string | undefined {
  return firstOptionalString(pattern, ["role", "Role", "key", "Key"]);
}

function colorValueFromPattern(pattern: AnyRecord): string | undefined {
  const color = firstRecordFromAliases(pattern, ["color", "Color"]);
  return (
    firstOptionalString(pattern, [
      "value",
      "Value",
      "hexCode",
      "hex_code",
      "HexCode",
      "colorValue",
      "color_value",
      "ColorValue",
    ]) ??
    firstOptionalStringFromSources(
      [color],
      ["hexCode", "hex_code", "HexCode", "value", "Value"],
    )
  );
}

function normalizeColorMapFromPalette(
  palette: AnyRecord | null,
): Record<string, string> | undefined {
  if (!palette) return undefined;
  const patterns = firstArray(palette, ["patterns", "Patterns"]);
  if (!patterns) return undefined;

  const colors: Record<string, string> = {};
  for (const pattern of patterns) {
    if (!isRecord(pattern)) continue;
    const key = themePatternKey(pattern);
    const value = colorValueFromPattern(pattern);
    const normalizedKey = key ? normalizeThemeMapKey(key) : "";
    if (normalizedKey && value) colors[normalizedKey] = value;
  }
  return Object.keys(colors).length ? colors : undefined;
}

function fontValueFromPattern(pattern: AnyRecord): string | undefined {
  const font = firstRecordFromAliases(pattern, ["font", "Font"]);
  return (
    firstOptionalString(pattern, [
      "family",
      "Family",
      "name",
      "Name",
      "fontFamily",
      "font_family",
      "FontFamily",
      "fontName",
      "font_name",
      "FontName",
    ]) ??
    firstOptionalStringFromSources([font], ["family", "Family", "name", "Name"])
  );
}

const FONT_RAW_URL_KEYS = [
  "url",
  "URL",
  "fontUrl",
  "fontURL",
  "font_url",
  "FontURL",
  "FontUrl",
];

const FONT_RESOURCE_PATH_KEYS = [
  "path",
  "Path",
  "resourcePath",
  "resource_path",
  "ResourcePath",
  "object_key",
  "objectKey",
  "ObjectKey",
  "s3_key",
  "s3Key",
  "S3Key",
];

function fontRawUrlFromPattern(pattern: AnyRecord): string | undefined {
  const font = firstRecordFromAliases(pattern, ["font", "Font"]);
  const resource = firstRecordFromAliases(font, ["resource", "Resource"]);
  return (
    firstOptionalString(pattern, [
      ...FONT_RAW_URL_KEYS,
      ...FONT_RESOURCE_PATH_KEYS,
    ]) ??
    firstOptionalStringFromSources(
      [font, resource],
      [...FONT_RAW_URL_KEYS, ...FONT_RESOURCE_PATH_KEYS],
    )
  );
}

function fontViewUrlFromPattern(pattern: AnyRecord): string | undefined {
  const font = firstRecordFromAliases(pattern, ["font", "Font"]);
  const resource = firstRecordFromAliases(font, ["resource", "Resource"]);
  return (
    firstOptionalString(pattern, [
      "viewUrl",
      "viewURL",
      "view_url",
      "ViewURL",
      "ViewUrl",
      "fontViewUrl",
      "fontViewURL",
      "font_view_url",
      "FontViewURL",
      "FontViewUrl",
    ]) ??
    firstOptionalStringFromSources(
      [font, resource],
      [
        "viewUrl",
        "viewURL",
        "view_url",
        "ViewURL",
        "ViewUrl",
        "fontViewUrl",
        "fontViewURL",
        "font_view_url",
        "FontViewURL",
        "FontViewUrl",
      ],
    )
  );
}

function fontViewUrlExpiresAtFromPattern(
  pattern: AnyRecord,
): string | undefined {
  const font = firstRecordFromAliases(pattern, ["font", "Font"]);
  const resource = firstRecordFromAliases(font, ["resource", "Resource"]);
  return (
    firstOptionalString(pattern, [
      "viewUrlExpiresAt",
      "viewURLExpiresAt",
      "view_url_expires_at",
      "ViewURLExpiresAt",
      "ViewUrlExpiresAt",
      "fontViewUrlExpiresAt",
      "fontViewURLExpiresAt",
      "font_view_url_expires_at",
      "FontViewURLExpiresAt",
      "FontViewUrlExpiresAt",
    ]) ??
    firstOptionalStringFromSources(
      [font, resource],
      [
        "viewUrlExpiresAt",
        "viewURLExpiresAt",
        "view_url_expires_at",
        "ViewURLExpiresAt",
        "ViewUrlExpiresAt",
        "fontViewUrlExpiresAt",
        "fontViewURLExpiresAt",
        "font_view_url_expires_at",
        "FontViewURLExpiresAt",
        "FontViewUrlExpiresAt",
      ],
    )
  );
}

function earliestIsoDateString(
  current: string | undefined,
  candidate: string | undefined,
): string | undefined {
  if (!candidate) return current;
  const candidateDate = new Date(candidate);
  if (Number.isNaN(candidateDate.getTime())) return current;
  if (!current) return candidateDate.toISOString();
  const currentDate = new Date(current);
  if (Number.isNaN(currentDate.getTime())) return candidateDate.toISOString();
  return candidateDate < currentDate ? candidateDate.toISOString() : current;
}

function normalizeFontMapsFromFontSet(fontSet: AnyRecord | null): {
  fonts?: Record<string, string>;
  fontUrls?: Record<string, string>;
  fontViewUrls?: Record<string, string>;
  fontViewUrlsExpiresAt?: string;
} {
  if (!fontSet) return {};
  const patterns = firstArray(fontSet, ["patterns", "Patterns"]);
  if (!patterns) return {};

  const fonts: Record<string, string> = {};
  const fontUrls: Record<string, string> = {};
  const fontViewUrls: Record<string, string> = {};
  let fontViewUrlsExpiresAt: string | undefined;
  for (const pattern of patterns) {
    if (!isRecord(pattern)) continue;
    const key = themePatternKey(pattern);
    if (!key) continue;
    const normalizedKey = normalizeThemeMapKey(key);
    if (!normalizedKey) continue;

    const font = fontValueFromPattern(pattern);
    const url = fontRawUrlFromPattern(pattern);
    const viewUrl = fontViewUrlFromPattern(pattern);
    if (font) fonts[normalizedKey] = font;
    if (url) fontUrls[normalizedKey] = url;
    if (viewUrl) fontViewUrls[normalizedKey] = viewUrl;
    fontViewUrlsExpiresAt = earliestIsoDateString(
      fontViewUrlsExpiresAt,
      fontViewUrlExpiresAtFromPattern(pattern),
    );
  }

  return {
    fonts: Object.keys(fonts).length ? fonts : undefined,
    fontUrls: Object.keys(fontUrls).length ? fontUrls : undefined,
    fontViewUrls: Object.keys(fontViewUrls).length ? fontViewUrls : undefined,
    fontViewUrlsExpiresAt,
  };
}

function normalizeSectionConfig(value: unknown): Record<string, unknown> {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return {};
    try {
      return normalizeSectionConfig(JSON.parse(trimmed));
    } catch {
      return {};
    }
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

function normalizeSectionConfigFromAliases(
  source: AnyRecord,
  keys: string[],
): Record<string, unknown> {
  for (const key of keys) {
    if (!(key in source) || source[key] === null || source[key] === undefined) {
      continue;
    }
    const config = normalizeSectionConfig(source[key]);
    if (Object.keys(config).length > 0) return config;
  }

  return {};
}

function normalizeMomentWallConfig(
  config: Record<string, unknown>,
): Record<string, unknown> {
  const normalized = { ...config };

  const identifier = optionalString(
    firstDefinedValue(config, ["identifier", "Identifier"]),
  );
  const title = optionalString(firstDefinedValue(config, ["title", "Title"]));
  const subtitle = optionalString(
    firstDefinedValue(config, ["subtitle", "Subtitle"]),
  );
  const momentRequestMessage = optionalString(
    firstDefinedValue(config, [
      "moment_request_message",
      "momentRequestMessage",
      "MomentRequestMessage",
    ]),
  );
  const allowUploads = optionalBoolean(
    firstDefinedValue(config, [
      "allow_uploads",
      "allowUploads",
      "AllowUploads",
    ]),
  );
  const allowMessages = optionalBoolean(
    firstDefinedValue(config, [
      "allow_messages",
      "allowMessages",
      "AllowMessages",
    ]),
  );
  const autoApproveUploads = optionalBoolean(
    firstDefinedValue(config, [
      "auto_approve_uploads",
      "autoApproveUploads",
      "AutoApproveUploads",
    ]),
  );
  const published = optionalBoolean(
    firstDefinedValue(config, ["published", "Published"]),
  );
  const momentsWallPublished = optionalBoolean(
    firstDefinedValue(config, [
      "moments_wall_published",
      "momentsWallPublished",
      "MomentsWallPublished",
      "show_moment_wall",
      "show_wall",
      "showMomentWall",
      "showWall",
      "ShowMomentWall",
      "ShowWall",
    ]),
  );
  const shareUploadsEnabled = optionalBoolean(
    firstDefinedValue(config, [
      "share_uploads_enabled",
      "shareUploadsEnabled",
      "ShareUploadsEnabled",
      "sharedUploadsEnabled",
      "SharedUploadsEnabled",
    ]),
  );
  const maxUploadsPerGuest = optionalNumber(
    firstDefinedValue(config, [
      "max_uploads_per_guest",
      "maxUploadsPerGuest",
      "MaxUploadsPerGuest",
      "uploads_limit",
      "uploadsLimit",
      "UploadsLimit",
    ]),
  );
  let effectiveAllowUploads = allowUploads;
  let effectiveShareUploadsEnabled = shareUploadsEnabled;
  const effectiveMomentsWallPublished = momentsWallPublished ?? published;

  if (
    effectiveShareUploadsEnabled === true &&
    effectiveAllowUploads === undefined &&
    effectiveMomentsWallPublished !== true
  ) {
    effectiveAllowUploads = true;
  }
  if (effectiveMomentsWallPublished === true) {
    effectiveAllowUploads = false;
    effectiveShareUploadsEnabled = false;
  }
  if (effectiveAllowUploads === false) {
    effectiveShareUploadsEnabled = false;
  }

  if (identifier) normalized.identifier = identifier;
  if (title) normalized.title = title;
  if (subtitle) normalized.subtitle = subtitle;
  if (momentRequestMessage)
    normalized.moment_request_message = momentRequestMessage;
  if (effectiveAllowUploads !== undefined)
    normalized.allow_uploads = effectiveAllowUploads;
  if (allowMessages !== undefined) normalized.allow_messages = allowMessages;
  if (autoApproveUploads !== undefined)
    normalized.auto_approve_uploads = autoApproveUploads;
  if (published !== undefined) normalized.published = published;
  if (effectiveMomentsWallPublished !== undefined) {
    normalized.moments_wall_published = effectiveMomentsWallPublished;
    normalized.show_moment_wall = effectiveMomentsWallPublished;
  }
  if (effectiveShareUploadsEnabled !== undefined)
    normalized.share_uploads_enabled = effectiveShareUploadsEnabled;
  if (maxUploadsPerGuest !== undefined)
    normalized.max_uploads_per_guest = Math.max(
      0,
      Math.trunc(maxUploadsPerGuest),
    );

  return normalized;
}

function normalizeAgendaItem(value: unknown): Record<string, unknown> | null {
  if (!isRecord(value)) return null;
  const normalized = { ...value };

  const time = optionalString(
    firstDefinedValue(value, [
      "time",
      "Time",
      "start_time",
      "startTime",
      "StartTime",
    ]),
  );
  const title = optionalString(
    firstDefinedValue(value, ["title", "Title", "name", "Name"]),
  );
  const description = optionalString(
    firstDefinedValue(value, [
      "description",
      "Description",
      "content",
      "Content",
    ]),
  );
  const icon = optionalString(firstDefinedValue(value, ["icon", "Icon"]));
  const location = optionalString(
    firstDefinedValue(value, ["location", "Location", "venue", "Venue"]),
  );

  if (time) normalized.time = time;
  if (title) normalized.title = title;
  if (description) normalized.description = description;
  if (icon) normalized.icon = icon;
  if (location) normalized.location = location;

  return normalized;
}

function normalizeAgendaConfig(
  config: Record<string, unknown>,
): Record<string, unknown> {
  const normalized = { ...config };

  const title = optionalString(firstDefinedValue(config, ["title", "Title"]));
  const subtitle = optionalString(
    firstDefinedValue(config, ["subtitle", "Subtitle"]),
  );
  const content = optionalString(
    firstDefinedValue(config, [
      "content",
      "Content",
      "body",
      "Body",
      "description",
      "Description",
    ]),
  );
  const items = firstDefinedValue(config, [
    "items",
    "Items",
    "agenda_items",
    "agendaItems",
    "AgendaItems",
  ]);

  if (title) normalized.title = title;
  if (subtitle) normalized.subtitle = subtitle;
  if (content) normalized.content = content;
  if (Array.isArray(items)) {
    normalized.items = items
      .map(normalizeAgendaItem)
      .filter((item): item is Record<string, unknown> => item !== null);
  }

  return normalized;
}

function setOptionalStringAlias(
  normalized: Record<string, unknown>,
  source: AnyRecord,
  targetKey: string,
  aliases: string[],
) {
  const value = optionalString(firstDefinedValue(source, aliases));
  if (value) normalized[targetKey] = value;
}

function normalizeCountdownHeaderConfig(
  config: Record<string, unknown>,
): Record<string, unknown> {
  const normalized = { ...config };
  setOptionalStringAlias(normalized, config, "heading", [
    "heading",
    "Heading",
    "title",
    "Title",
  ]);
  setOptionalStringAlias(normalized, config, "targetDate", [
    "targetDate",
    "target_date",
    "TargetDate",
    "eventDateTime",
    "event_date_time",
    "EventDateTime",
  ]);
  return normalized;
}

function normalizeGraduationHeroConfig(
  config: Record<string, unknown>,
): Record<string, unknown> {
  const normalized = { ...config };
  setOptionalStringAlias(normalized, config, "title", ["title", "Title"]);
  setOptionalStringAlias(normalized, config, "years", [
    "years",
    "Years",
    "yearRange",
    "year_range",
    "YearRange",
  ]);
  setOptionalStringAlias(normalized, config, "school", [
    "school",
    "School",
    "schoolName",
    "school_name",
    "SchoolName",
  ]);
  return normalized;
}

function normalizeVenueConfig(
  config: Record<string, unknown>,
): Record<string, unknown> {
  const normalized = { ...config };
  setOptionalStringAlias(normalized, config, "text", [
    "text",
    "Text",
    "description",
    "Description",
    "content",
    "Content",
  ]);
  setOptionalStringAlias(normalized, config, "date", [
    "date",
    "Date",
    "eventDate",
    "event_date",
    "EventDate",
  ]);
  setOptionalStringAlias(normalized, config, "venueText", [
    "venueText",
    "venue_text",
    "VenueText",
    "venue",
    "Venue",
    "location",
    "Location",
  ]);
  setOptionalStringAlias(normalized, config, "mapUrl", [
    "mapUrl",
    "mapURL",
    "map_url",
    "MapURL",
    "MapUrl",
    "googleMapsUrl",
    "googleMapsURL",
    "google_maps_url",
    "GoogleMapsURL",
    "GoogleMapsUrl",
  ]);
  return normalized;
}

function normalizeGraduatesListConfig(
  config: Record<string, unknown>,
): Record<string, unknown> {
  const normalized = { ...config };
  setOptionalStringAlias(normalized, config, "closing", [
    "closing",
    "Closing",
    "content",
    "Content",
  ]);
  return normalized;
}

function normalizeRSVPConfirmationConfig(
  config: Record<string, unknown>,
): Record<string, unknown> {
  const normalized = { ...config };
  setOptionalStringAlias(normalized, config, "welcome_message", [
    "welcome_message",
    "welcomeMessage",
    "WelcomeMessage",
    "default_welcome_message",
    "defaultWelcomeMessage",
    "DefaultWelcomeMessage",
  ]);
  setOptionalStringAlias(normalized, config, "thank_you_message", [
    "thank_you_message",
    "thankYouMessage",
    "ThankYouMessage",
    "default_thank_you_message",
    "defaultThankYouMessage",
    "DefaultThankYouMessage",
  ]);
  setOptionalStringAlias(normalized, config, "guest_signature_title", [
    "guest_signature_title",
    "guestSignatureTitle",
    "GuestSignatureTitle",
    "default_guest_signature_title",
    "defaultGuestSignatureTitle",
    "DefaultGuestSignatureTitle",
  ]);
  return normalized;
}

function normalizeLegacyHeroConfig(
  config: Record<string, unknown>,
): Record<string, unknown> {
  const normalized = { ...config };
  setOptionalStringAlias(normalized, config, "title", ["title", "Title"]);
  setOptionalStringAlias(normalized, config, "subtitle", [
    "subtitle",
    "Subtitle",
  ]);
  setOptionalStringAlias(normalized, config, "content", [
    "content",
    "Content",
    "body",
    "Body",
  ]);
  setOptionalStringAlias(normalized, config, "imageUrl", [
    "imageUrl",
    "imageURL",
    "image_url",
    "ImageURL",
    "ImageUrl",
  ]);
  return normalized;
}

function normalizeLegacyTextConfig(
  config: Record<string, unknown>,
): Record<string, unknown> {
  const normalized = { ...config };
  setOptionalStringAlias(normalized, config, "title", ["title", "Title"]);
  setOptionalStringAlias(normalized, config, "content", [
    "content",
    "Content",
    "body",
    "Body",
    "description",
    "Description",
    "text",
    "Text",
  ]);
  return normalized;
}

function normalizeLegacyGalleryConfig(
  config: Record<string, unknown>,
): Record<string, unknown> {
  const normalized = { ...config };
  setOptionalStringAlias(normalized, config, "title", ["title", "Title"]);
  setOptionalStringAlias(normalized, config, "subtitle", [
    "subtitle",
    "Subtitle",
  ]);
  return normalized;
}

function normalizeLegacyMapConfig(
  config: Record<string, unknown>,
): Record<string, unknown> {
  const normalized = { ...config };
  setOptionalStringAlias(normalized, config, "title", ["title", "Title"]);
  setOptionalStringAlias(normalized, config, "content", [
    "content",
    "Content",
    "body",
    "Body",
    "description",
    "Description",
  ]);
  setOptionalStringAlias(normalized, config, "mapUrl", [
    "mapUrl",
    "mapURL",
    "map_url",
    "MapURL",
    "MapUrl",
    "googleMapsUrl",
    "googleMapsURL",
    "google_maps_url",
    "GoogleMapsURL",
    "GoogleMapsUrl",
  ]);
  return normalized;
}

function normalizeLegacyMusicConfig(
  config: Record<string, unknown>,
): Record<string, unknown> {
  const normalized = { ...config };
  setOptionalStringAlias(normalized, config, "musicUrl", [
    "musicUrl",
    "musicURL",
    "music_url",
    "MusicURL",
    "MusicUrl",
  ]);
  setOptionalStringAlias(normalized, config, "audioUrl", [
    "audioUrl",
    "audioURL",
    "audio_url",
    "AudioURL",
    "AudioUrl",
  ]);
  setOptionalStringAlias(normalized, config, "url", ["url", "URL"]);
  return normalized;
}

function normalizeSectionTypeToken(type: string): string {
  return type
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, "");
}

function pageSpecSectionKind(type: string): string {
  switch (normalizeSectionTypeToken(type)) {
    case "countdown":
    case "countdownheader":
      return "CountdownHeader";
    case "graduationhero":
    case "graduationheader":
      return "GraduationHero";
    case "eventvenue":
    case "eventlocation":
    case "venue":
      return "EventVenue";
    case "reception":
    case "secondlocation":
      return "Reception";
    case "graduateslist":
      return "GraduatesList";
    case "host":
    case "hosts":
    case "hostsection":
    case "hostssection":
      return "Hosts";
    case "rsvp":
    case "rsvpsection":
    case "rsvpconfirmation":
      return "RSVPConfirmation";
    case "momentwall":
    case "momentswall":
      return "MomentWall";
    case "agenda":
    case "agendasection":
    case "schedule":
    case "legacyschedule":
      return "Agenda";
    case "hero":
    case "legacyhero":
      return "HERO";
    case "text":
    case "legacytext":
    case "contact":
    case "contactsection":
      return "TEXT";
    case "gallery":
    case "legacygallery":
      return "GALLERY";
    case "photogrid":
    case "photogallery":
      return "PhotoGrid";
    case "map":
    case "legacymap":
      return "MAP";
    case "music":
    case "legacymusic":
      return "MUSIC";
    default:
      return type;
  }
}

function normalizeSectionConfigForType(
  type: string,
  config: Record<string, unknown>,
): Record<string, unknown> {
  const kind = pageSpecSectionKind(type);
  if (kind === "CountdownHeader") return normalizeCountdownHeaderConfig(config);
  if (kind === "GraduationHero") return normalizeGraduationHeroConfig(config);
  if (kind === "EventVenue") return normalizeVenueConfig(config);
  if (kind === "Reception") return normalizeVenueConfig(config);
  if (kind === "GraduatesList" || kind === "Hosts")
    return normalizeGraduatesListConfig(config);
  if (kind === "RSVPConfirmation")
    return normalizeRSVPConfirmationConfig(config);
  if (kind === "MomentWall") return normalizeMomentWallConfig(config);
  if (kind === "Agenda") return normalizeAgendaConfig(config);
  if (kind === "HERO") return normalizeLegacyHeroConfig(config);
  if (kind === "TEXT") return normalizeLegacyTextConfig(config);
  if (kind === "GALLERY") return normalizeLegacyGalleryConfig(config);
  if (kind === "MAP") return normalizeLegacyMapConfig(config);
  if (kind === "MUSIC") return normalizeLegacyMusicConfig(config);
  return config;
}

function normalizePageSpecContact(value: unknown): PageSpec["meta"]["contact"] {
  if (!isRecord(value)) return undefined;
  const contact: NonNullable<PageSpec["meta"]["contact"]> = {};
  const name = optionalString(firstValue(value, ["name", "Name"]));
  const phone = optionalString(firstValue(value, ["phone", "Phone"]));
  const email = optionalString(firstValue(value, ["email", "Email"]));
  if (name) contact.name = name;
  if (phone) contact.phone = phone;
  if (email) contact.email = email;
  return Object.keys(contact).length ? contact : undefined;
}

function normalizePageSpecAccess(value: unknown): PageSpec["meta"]["access"] {
  if (!isRecord(value)) return undefined;
  const activeFrom = optionalAccessDateString(
    firstValue(value, ["activeFrom", "active_from", "ActiveFrom"]),
  );
  const activeUntil = optionalAccessDateString(
    firstValue(value, ["activeUntil", "active_until", "ActiveUntil"]),
  );
  const passwordProtected = optionalBoolean(
    firstValue(value, [
      "passwordProtected",
      "password_protected",
      "PasswordProtected",
    ]),
  );
  const accessVersion = optionalString(
    firstValue(value, ["accessVersion", "access_version", "AccessVersion"]),
  );
  const previewAuthorized = optionalBoolean(
    firstValue(value, [
      "previewAuthorized",
      "preview_authorized",
      "PreviewAuthorized",
    ]),
  );
  const passwordVerified = optionalBoolean(
    firstValue(value, [
      "passwordVerified",
      "password_verified",
      "PasswordVerified",
    ]),
  );
  if (
    !activeFrom &&
    !activeUntil &&
    passwordProtected === undefined &&
    !accessVersion &&
    previewAuthorized === undefined &&
    passwordVerified === undefined
  )
    return undefined;

  const access: PageSpec["meta"]["access"] = {
    passwordProtected: passwordProtected ?? false,
  };
  if (activeFrom) access.activeFrom = activeFrom;
  if (activeUntil) access.activeUntil = activeUntil;
  if (accessVersion) access.accessVersion = accessVersion;
  if (previewAuthorized !== undefined)
    access.previewAuthorized = previewAuthorized;
  if (passwordVerified !== undefined)
    access.passwordVerified = passwordVerified;
  return access;
}

function normalizePageSpecTheme(value: unknown): PageSpec["meta"]["theme"] {
  if (!isRecord(value)) return undefined;
  const designTemplate = firstRecordFromAliases(value, [
    "designTemplate",
    "design_template",
    "DesignTemplate",
    "template",
    "Template",
  ]);
  const colorPalette = firstRecordFromSources(
    [value, designTemplate],
    [
      "colorPalette",
      "color_palette",
      "ColorPalette",
      "defaultColorPalette",
      "default_color_palette",
      "DefaultColorPalette",
    ],
  );
  const fontSet = firstRecordFromSources(
    [value, designTemplate],
    [
      "fontSet",
      "font_set",
      "FontSet",
      "defaultFontSet",
      "default_font_set",
      "DefaultFontSet",
    ],
  );

  const theme: NonNullable<PageSpec["meta"]["theme"]> = {};
  const designTemplateId =
    firstOptionalString(value, [
      "designTemplateId",
      "designTemplateID",
      "design_template_id",
      "DesignTemplateID",
      "DesignTemplateId",
    ]) ?? firstOptionalStringFromSources([designTemplate], ["id", "ID"]);
  const designTemplateIdentifier =
    firstOptionalString(value, [
      "designTemplateIdentifier",
      "design_template_identifier",
      "DesignTemplateIdentifier",
    ]) ??
    firstOptionalStringFromSources(
      [designTemplate],
      ["identifier", "Identifier"],
    );
  const colorPaletteId =
    firstOptionalStringFromSources(
      [value, designTemplate],
      [
        "colorPaletteId",
        "colorPaletteID",
        "color_palette_id",
        "ColorPaletteID",
        "ColorPaletteId",
        "defaultColorPaletteId",
        "defaultColorPaletteID",
        "default_color_palette_id",
        "DefaultColorPaletteID",
        "DefaultColorPaletteId",
      ],
    ) ?? firstOptionalStringFromSources([colorPalette], ["id", "ID"]);
  const colorPaletteName =
    firstOptionalString(value, [
      "colorPaletteName",
      "color_palette_name",
      "ColorPaletteName",
    ]) ?? firstOptionalStringFromSources([colorPalette], ["name", "Name"]);
  const fontSetId =
    firstOptionalStringFromSources(
      [value, designTemplate],
      [
        "fontSetId",
        "fontSetID",
        "font_set_id",
        "FontSetID",
        "FontSetId",
        "defaultFontSetId",
        "defaultFontSetID",
        "default_font_set_id",
        "DefaultFontSetID",
        "DefaultFontSetId",
      ],
    ) ?? firstOptionalStringFromSources([fontSet], ["id", "ID"]);
  const fontSetName =
    firstOptionalString(value, [
      "fontSetName",
      "font_set_name",
      "FontSetName",
    ]) ?? firstOptionalStringFromSources([fontSet], ["name", "Name"]);
  const colors = mergeThemeStringMaps(
    normalizeColorMapFromPalette(colorPalette),
    optionalThemeStringMap(firstValue(value, ["colors", "Colors"])),
  );
  const derivedFontMaps = normalizeFontMapsFromFontSet(fontSet);
  const fonts = mergeThemeStringMaps(
    derivedFontMaps.fonts,
    optionalThemeStringMap(firstValue(value, ["fonts", "Fonts"])),
  );
  const fontUrls = mergeThemeStringMaps(
    derivedFontMaps.fontUrls,
    optionalThemeStringMap(
      firstValue(value, [
        "fontUrls",
        "fontURLs",
        "font_urls",
        "FontURLs",
        "FontURLS",
        "FontUrls",
      ]),
    ),
  );
  const fontViewUrls = mergeThemeStringMaps(
    derivedFontMaps.fontViewUrls,
    optionalThemeStringMap(
      firstValue(value, [
        "fontViewUrls",
        "fontViewURLs",
        "font_view_urls",
        "FontViewURLs",
        "FontViewURLS",
        "FontViewUrls",
        "fontViewURLS",
        "viewFontUrls",
        "view_font_urls",
        "ViewFontURLs",
        "viewFontURLS",
      ]),
    ),
  );
  const fontViewUrlsExpiresAt = earliestIsoDateString(
    derivedFontMaps.fontViewUrlsExpiresAt,
    firstOptionalString(value, [
      "fontViewUrlsExpiresAt",
      "fontViewURLsExpiresAt",
      "fontViewURLSExpiresAt",
      "font_view_urls_expires_at",
      "FontViewURLsExpiresAt",
      "FontViewURLSExpiresAt",
      "FontViewUrlsExpiresAt",
    ]),
  );

  if (designTemplateId) theme.designTemplateId = designTemplateId;
  if (designTemplateIdentifier)
    theme.designTemplateIdentifier = designTemplateIdentifier;
  if (colorPaletteId) theme.colorPaletteId = colorPaletteId;
  if (colorPaletteName) theme.colorPaletteName = colorPaletteName;
  if (fontSetId) theme.fontSetId = fontSetId;
  if (fontSetName) theme.fontSetName = fontSetName;
  if (colors) theme.colors = colors;
  if (fonts) theme.fonts = fonts;
  if (fontUrls) theme.fontUrls = fontUrls;
  if (fontViewUrls) theme.fontViewUrls = fontViewUrls;
  if (fontViewUrlsExpiresAt)
    theme.fontViewUrlsExpiresAt = fontViewUrlsExpiresAt;
  return Object.keys(theme).length ? theme : undefined;
}

function normalizePageSpecMeta(value: AnyRecord): PageSpec["meta"] {
  const meta: PageSpec["meta"] = {
    pageTitle:
      optionalString(
        firstValue(value, ["pageTitle", "page_title", "PageTitle"]),
      ) ?? "",
  };

  const musicUrl = optionalString(
    firstValue(value, ["musicUrl", "music_url", "MusicUrl", "MusicURL"]),
  );
  const contact = normalizePageSpecContact(
    firstValue(value, ["contact", "Contact"]),
  );
  const eventId = optionalString(
    firstValue(value, ["eventId", "eventID", "event_id", "EventID", "EventId"]),
  );
  const identifier = optionalString(
    firstValue(value, ["identifier", "Identifier"]),
  );
  const coverImageUrl = firstOptionalString(value, [
    "coverImageUrl",
    "coverImageURL",
    "cover_image_url",
    "CoverImageURL",
    "CoverImageUrl",
  ]);
  const coverViewUrl = firstOptionalString(value, [
    "coverViewUrl",
    "coverViewURL",
    "cover_view_url",
    "viewUrl",
    "viewURL",
    "view_url",
    "CoverViewURL",
    "CoverViewUrl",
    "ViewURL",
    "ViewUrl",
  ]);
  const coverImageUrlExpiresAt = firstOptionalString(value, [
    "coverImageUrlExpiresAt",
    "coverImageURLExpiresAt",
    "cover_image_url_expires_at",
    "CoverImageURLExpiresAt",
    "CoverImageUrlExpiresAt",
  ]);
  const coverViewUrlExpiresAt = firstOptionalString(value, [
    "coverViewUrlExpiresAt",
    "coverViewURLExpiresAt",
    "cover_view_url_expires_at",
    "viewUrlExpiresAt",
    "viewURLExpiresAt",
    "view_url_expires_at",
    "CoverViewURLExpiresAt",
    "CoverViewUrlExpiresAt",
    "ViewURLExpiresAt",
    "ViewUrlExpiresAt",
  ]);
  const eventDateTime = optionalString(
    firstValue(value, ["eventDateTime", "event_date_time", "EventDateTime"]),
  );
  const eventDate = optionalString(
    firstValue(value, ["eventDate", "event_date", "EventDate"]),
  );
  const address = optionalString(firstValue(value, ["address", "Address"]));
  const secondAddress = optionalString(
    firstValue(value, ["secondAddress", "second_address", "SecondAddress"]),
  );
  const timezone = optionalString(
    firstValue(value, ["timezone", "Timezone", "timeZone", "TimeZone"]),
  );
  const language = optionalString(
    firstValue(value, ["language", "Language", "locale", "Locale"]),
  );
  const eventType = optionalString(
    firstValue(value, ["eventType", "event_type", "EventType"]),
  );
  const contentVersion = optionalString(
    firstValue(value, [
      "contentVersion",
      "content_version",
      "ContentVersion",
    ]),
  );
  const access = normalizePageSpecAccess(
    firstValue(value, ["access", "Access"]),
  );
  const footerVisible = optionalBoolean(
    firstValue(value, ["footerVisible", "footer_visible", "FooterVisible"]),
  );
  const theme = normalizePageSpecTheme(firstValue(value, ["theme", "Theme"]));

  if (musicUrl) meta.musicUrl = musicUrl;
  if (contact) meta.contact = contact;
  if (eventId) meta.eventId = eventId;
  if (identifier) meta.identifier = identifier;
  if (coverImageUrl) meta.coverImageUrl = coverImageUrl;
  if (coverViewUrl) meta.coverViewUrl = coverViewUrl;
  if (coverImageUrlExpiresAt)
    meta.coverImageUrlExpiresAt = coverImageUrlExpiresAt;
  if (coverViewUrlExpiresAt) meta.coverViewUrlExpiresAt = coverViewUrlExpiresAt;
  if (eventDateTime) meta.eventDateTime = eventDateTime;
  if (eventDate) meta.eventDate = eventDate;
  if (address) meta.address = address;
  if (secondAddress) meta.secondAddress = secondAddress;
  if (timezone) meta.timezone = timezone;
  if (language) meta.language = language;
  if (eventType) meta.eventType = eventType;
  if (contentVersion) meta.contentVersion = contentVersion;
  if (access) meta.access = access;
  if (footerVisible !== undefined) meta.footerVisible = footerVisible;
  if (theme) meta.theme = theme;
  return meta;
}

function pageSpecSectionVisible(value: unknown): boolean {
  if (!isRecord(value)) return false;
  const visible = optionalBoolean(
    firstDefinedValue(value, [
      "isVisible",
      "is_visible",
      "IsVisible",
      "visible",
      "Visible",
    ]),
  );
  return visible !== false;
}

function normalizePageSpecSection(
  value: unknown,
  fallbackOrder: number,
): PageSpec["sections"][number] | null {
  if (!isRecord(value)) return null;
  const type =
    optionalString(
      firstValue(value, [
        "type",
        "Type",
        "component_type",
        "componentType",
        "ComponentType",
      ]),
    ) ?? "";
  if (!type) return null;

  const config = normalizeSectionConfigFromAliases(value, [
    "config",
    "Config",
    "content_json",
    "contentJson",
    "ContentJSON",
    "ContentJson",
  ]);

  return {
    type,
    title: optionalString(
      firstValue(value, ["title", "section_title", "Title", "SectionTitle"]),
    ),
    sectionId:
      optionalString(
        firstValue(value, [
          "sectionId",
          "section_id",
          "eventSectionId",
          "event_section_id",
          "SectionID",
          "SectionId",
          "EventSectionID",
          "EventSectionId",
          "id",
          "ID",
        ]),
      ) ?? "",
    order:
      optionalNumber(
        firstValue(value, [
          "order",
          "Order",
          "sort_order",
          "sortOrder",
          "SortOrder",
        ]),
      ) ?? fallbackOrder,
    config: normalizeSectionConfigForType(type, config),
  };
}

export function sortPageSpecSections(
  sections: PageSpec["sections"],
): PageSpec["sections"] {
  return [...sections].sort((a, b) => {
    if (a.order !== b.order) return a.order - b.order;
    return a.sectionId.localeCompare(b.sectionId);
  });
}

function normalizePageSpecRecord(value: unknown): PageSpec | null {
  if (!isRecord(value)) return null;
  const meta = firstRecord(value, ["meta", "Meta"]);
  const sections = firstArray(value, ["sections", "Sections"]);
  if (!meta || !sections) return null;

  const normalizedSections = sections
    .map((section, index) =>
      pageSpecSectionVisible(section)
        ? normalizePageSpecSection(section, index)
        : null,
    )
    .filter(
      (section): section is PageSpec["sections"][number] => section !== null,
    );

  return {
    meta: normalizePageSpecMeta(meta),
    sections: sortPageSpecSections(normalizedSections),
  };
}

function pageSpecPayloadCandidates(payload: unknown): unknown[] {
  const candidates = [readApiData<unknown>(payload)];

  if (isRecord(payload)) {
    const rawData = firstValue(payload, ["data", "Data"]);
    if (rawData !== undefined && !candidates.includes(rawData)) {
      candidates.push(rawData);
    }
  }

  return candidates;
}

function readPageSpecCandidate(data: unknown): PageSpec | null {
  const direct = normalizePageSpecRecord(data);
  if (direct) return direct;

  if (isRecord(data)) {
    const nested = firstValue(data, ["data", "Data"]);
    const nestedSpec = normalizePageSpecRecord(nested);
    if (nestedSpec) return nestedSpec;
  }

  return null;
}

export function readPageSpecPayload(payload: unknown): PageSpec | null {
  for (const data of pageSpecPayloadCandidates(payload)) {
    const spec = readPageSpecCandidate(data);
    if (spec) return spec;
  }

  return null;
}

function readPageSpecMetaCandidate(data: unknown): PageSpec["meta"] | null {
  if (!isRecord(data)) return null;

  const directMeta = firstRecord(data, ["meta", "Meta"]);
  if (directMeta) return normalizePageSpecMeta(directMeta);

  const nested = firstValue(data, ["data", "Data"]);
  if (isRecord(nested)) {
    const nestedMeta = firstRecord(nested, ["meta", "Meta"]);
    if (nestedMeta) return normalizePageSpecMeta(nestedMeta);
  }

  return null;
}

export function readPageSpecMetaPayload(
  payload: unknown,
): PageSpec["meta"] | null {
  const spec = readPageSpecPayload(payload);
  if (spec) return spec.meta;

  for (const data of pageSpecPayloadCandidates(payload)) {
    const meta = readPageSpecMetaCandidate(data);
    if (meta) return meta;
  }

  return null;
}

export function normalizePageSpec(spec: PageSpec): PageSpec {
  return (
    readPageSpecPayload(spec) ?? {
      meta: { pageTitle: "" },
      sections: [],
    }
  );
}

export function getPageSpecCacheTtlMs(mode: PageSpecCacheMode): number {
  return mode === "identifier"
    ? IDENTIFIER_PAGE_SPEC_CACHE_TTL_MS
    : TOKEN_PAGE_SPEC_CACHE_TTL_MS;
}

function earliestDate(dates: Array<Date | null | undefined>): Date | null {
  let earliest: Date | null = null;
  for (const date of dates) {
    if (!date || !Number.isFinite(date.getTime())) continue;
    if (!earliest || date.getTime() < earliest.getTime()) earliest = date;
  }
  return earliest;
}

function optionalDate(value: string | undefined): Date | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function getPageSpecCoverExpiry(spec: PageSpec): Date | null {
  return earliestDate([
    optionalDate(
      spec.meta.coverViewUrlExpiresAt || spec.meta.coverImageUrlExpiresAt,
    ),
    getPresignedUrlExpiry(spec.meta.coverViewUrl || spec.meta.coverImageUrl),
  ]);
}

export function getPageSpecThemeFontExpiry(spec: PageSpec): Date | null {
  const urls = {
    ...(spec.meta.theme?.fontUrls ?? {}),
    ...(spec.meta.theme?.fontViewUrls ?? {}),
  };
  return earliestDate(
    [
      optionalDate(spec.meta.theme?.fontViewUrlsExpiresAt),
      ...Object.values(urls).map((url) => getPresignedUrlExpiry(url)),
    ],
  );
}

export function getPageSpecCacheExpiresAt(
  spec: PageSpec,
  mode: PageSpecCacheMode,
  cachedAt: number,
): number {
  const ttlExpiresAt = cachedAt + getPageSpecCacheTtlMs(mode);
  const signedMediaExpiresAt = earliestDate([
    getPageSpecCoverExpiry(spec),
    getPageSpecThemeFontExpiry(spec),
  ])?.getTime();
  if (!signedMediaExpiresAt || !Number.isFinite(signedMediaExpiresAt))
    return ttlExpiresAt;
  return Math.min(
    ttlExpiresAt,
    signedMediaExpiresAt - PAGE_SPEC_SIGNED_MEDIA_CACHE_SKEW_MS,
  );
}

export function shouldRenderPageSpecCacheBeforeRevalidate(
  mode: PageSpecCacheMode,
  hasInvitationToken = false,
): boolean {
  return mode === "token" || hasInvitationToken;
}

export function shouldRenderCachedPageSpecBeforeRevalidate(
  mode: PageSpecCacheMode,
  spec: PageSpec,
  hasInvitationToken = false,
): boolean {
  if (!shouldRenderPageSpecCacheBeforeRevalidate(mode, hasInvitationToken)) {
    return false;
  }

  // A cached full-content spec that says "no password" can become unsafe if the
  // dashboard enabled password protection after the cache was written.
  // Cached locked specs can render the password gate immediately, but cached
  // full-content specs with a proof must wait for backend revalidation.
  return (
    spec.meta.access?.passwordProtected === true &&
    spec.meta.access.passwordVerified !== true &&
    spec.meta.access.previewAuthorized !== true
  );
}

export function pageSpecCacheKey(
  cacheId: string,
  mode: PageSpecCacheMode,
  namespace = "",
): string {
  const cleanNamespace = namespace.trim();
  const hashedCacheId = cacheTokenHash(cacheId);
  return cleanNamespace
    ? `pageSpec-${mode}-${encodeURIComponent(cleanNamespace)}-${hashedCacheId}`
    : `pageSpec-${mode}-${hashedCacheId}`;
}

function resolveStorage(storage?: StorageLike): StorageLike | null {
  if (storage) return storage;
  if (typeof sessionStorage === "undefined") return null;
  return sessionStorage;
}

export function readPageSpecCache(
  cacheId: string,
  mode: PageSpecCacheMode,
  storage?: StorageLike,
  now = Date.now(),
  namespace = "",
): PageSpec | null {
  const resolvedStorage = resolveStorage(storage);
  if (!resolvedStorage) return null;

  const key = pageSpecCacheKey(cacheId, mode, namespace);
  try {
    const raw = resolvedStorage.getItem(key);
    if (!raw) return null;

    const cached = JSON.parse(raw) as Partial<CachedPageSpec>;
    if (!cached.spec || typeof cached.ts !== "number") {
      resolvedStorage.removeItem(key);
      return null;
    }

    const normalizedSpec = readPageSpecPayload(cached.spec);
    if (!normalizedSpec) {
      resolvedStorage.removeItem(key);
      return null;
    }
    if (now > getPageSpecCacheExpiresAt(normalizedSpec, mode, cached.ts)) {
      resolvedStorage.removeItem(key);
      return null;
    }
    return normalizedSpec;
  } catch {
    resolvedStorage.removeItem(key);
    return null;
  }
}

export function writePageSpecCache(
  cacheId: string,
  spec: PageSpec,
  mode: PageSpecCacheMode,
  storage?: StorageLike,
  now = Date.now(),
  namespace = "",
) {
  const resolvedStorage = resolveStorage(storage);
  if (!resolvedStorage) return;

  try {
    const normalizedSpec = normalizePageSpec(spec);
    resolvedStorage.setItem(
      pageSpecCacheKey(cacheId, mode, namespace),
      JSON.stringify({ spec: normalizedSpec, ts: now }),
    );
  } catch {
    // sessionStorage full or unavailable - skip silently
  }
}

export function removePageSpecCache(
  cacheId: string,
  mode: PageSpecCacheMode,
  storage?: StorageLike,
  namespace = "",
) {
  const resolvedStorage = resolveStorage(storage);
  if (!resolvedStorage) return;
  resolvedStorage.removeItem(pageSpecCacheKey(cacheId, mode, namespace));
}
