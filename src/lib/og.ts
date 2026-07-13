/**
 * Builds the branded OG image URL using the dashboard's /api/og endpoint.
 * Falls back to the event's cover_image_url if no dashboard URL is configured.
 */

import { normalizeEventsUrl } from "./eventsUrl";
import { buildEventMetaUrl, buildInvitationByTokenUrl } from "./apiUrls";
import { buildIdentifierPageSpecUrl } from "./pageSpecUrl";
import { readApiData } from "./apiEnvelope";
import { fetchApiData } from "./apiFetch";
import { parsePublicEventDate } from "./eventDate";
import { resolvePublicMediaUrl } from "./mediaUrl";
import { readPageSpecMetaPayload } from "./pageSpecCache";
import { publicAccessFetchInit } from "./publicPreview";

function dashboardOgBaseUrl(): string | undefined {
  return import.meta.env.PUBLIC_DASHBOARD_URL as string | undefined;
}

interface OgImageParams {
  title: string;
  date?: string;
  timezone?: string;
  language?: string;
  address?: string;
  cover?: string;
  type?: string;
  eventsUrl?: string;
}

export function buildOgImageUrl(params: OgImageParams): string {
  const cover = resolveOgCoverUrl(params.cover, params.eventsUrl);
  const dashboardUrl = dashboardOgBaseUrl();

  if (!dashboardUrl) return cover;

  const url = new URL("/api/og", dashboardUrl);
  url.searchParams.set("title", params.title);
  if (params.date) url.searchParams.set("date", params.date);
  if (params.timezone) url.searchParams.set("timezone", params.timezone);
  if (params.language) url.searchParams.set("language", params.language);
  if (params.address) url.searchParams.set("address", params.address);
  if (cover) url.searchParams.set("cover", cover);
  if (params.type) url.searchParams.set("type", params.type);

  return url.toString();
}

export function resolveOgCoverUrl(
  cover: string | null | undefined,
  eventsUrl?: string,
): string {
  const raw = cover?.trim() ?? "";
  if (!raw) return "";
  return eventsUrl ? resolvePublicMediaUrl(raw, eventsUrl) : raw;
}

function validOgDate(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  return parsePublicEventDate(trimmed) ? trimmed : undefined;
}

function shouldFallbackToPageSpec(res: Response): boolean {
  return res.status === 404 || res.status === 405;
}

// Public-safe shape returned by GET /api/events/:identifier/meta.
export interface EventOgData {
  name: string;
  identifier?: string;
  description?: string;
  cover_image_url?: string;
  cover_view_url?: string;
  cover_view_url_expires_at?: string;
  view_url?: string;
  view_url_expires_at?: string;
  event_date_time?: string;
  address?: string;
  second_address?: string;
  timezone?: string;
  language?: string;
  organizer_name?: string;
  event_type?: string;
  content_version?: string;
}

export interface PublicOgMeta {
  title: string;
  description: string;
  image: string;
}

export type SharedUploadOgMeta = PublicOgMeta;

function buildEventOgImage(
  event: EventOgData,
  title: string,
  eventsUrl?: string,
): string {
  return buildOgImageUrl({
    title,
    date: validOgDate(event.event_date_time),
    timezone: event.timezone,
    language: event.language,
    address: firstString(event.address, event.second_address),
    cover: event.cover_view_url || event.view_url || event.cover_image_url,
    type: event.event_type,
    eventsUrl,
  });
}

export function buildPublicEventOgMeta(
  event: EventOgData | null | undefined,
  eventsUrl?: string,
): PublicOgMeta {
  const fallback: PublicOgMeta = {
    title: "Estas invitado",
    description: "Abre tu invitacion y descubre todos los detalles del evento.",
    image: "",
  };

  if (!event) return fallback;

  const eventName = event.name?.trim();
  const title = eventName || fallback.title;
  const description = event.description?.trim()
    ? event.description.trim().slice(0, 160)
    : event.organizer_name?.trim()
      ? `${event.organizer_name.trim()} te invita. Abre para ver fecha, lugar y confirmar asistencia.`
      : fallback.description;

  return {
    title,
    description,
    image: buildEventOgImage(event, title, eventsUrl),
  };
}

export function buildRsvpOgMeta(
  event: EventOgData | null | undefined,
  eventsUrl?: string,
): PublicOgMeta {
  const fallback: PublicOgMeta = {
    title: "Confirma tu asistencia",
    description:
      "Te esperamos. Confirma en un tap y no te pierdas ningun detalle.",
    image: "",
  };

  const eventName = event?.name?.trim();
  if (!event || !eventName) return fallback;

  return {
    title: `Confirma | ${eventName}`,
    description: event.organizer_name?.trim()
      ? `${event.organizer_name.trim()} te espera. Confirma tu asistencia en segundos.`
      : fallback.description,
    image: buildEventOgImage(event, eventName, eventsUrl),
  };
}

export function buildMomentsOgMeta(
  event: EventOgData | null | undefined,
  eventsUrl?: string,
): PublicOgMeta {
  const fallback: PublicOgMeta = {
    title: "Momentos del evento",
    description: "Las mejores fotos y videos del evento. Revive cada momento.",
    image: "",
  };

  const eventName = event?.name?.trim();
  if (!event || !eventName) return fallback;

  const title = `Momentos - ${eventName}`;
  return {
    title,
    description: `Galeria de fotos y videos de ${eventName}. Revive los mejores momentos.`,
    image: buildEventOgImage(event, title, eventsUrl),
  };
}

export function buildTvOgMeta(
  event: EventOgData | null | undefined,
  eventsUrl?: string,
): PublicOgMeta {
  const fallback: PublicOgMeta = {
    title: "Slideshow del evento",
    description:
      "Modo TV para disfrutar los momentos del evento en pantalla completa.",
    image: "",
  };

  const eventName = event?.name?.trim();
  if (!event || !eventName) return fallback;

  return {
    title: `Slideshow - ${eventName}`,
    description: `Disfruta los momentos de ${eventName} en modo TV.`,
    image: buildEventOgImage(event, eventName, eventsUrl),
  };
}

export function buildSharedUploadOgMeta(
  event: EventOgData | null | undefined,
  eventsUrl?: string,
): SharedUploadOgMeta {
  const fallback: SharedUploadOgMeta = {
    title: "Comparte tu momento",
    description:
      "Sube tus fotos y videos del evento. Tus recuerdos son parte de la historia.",
    image: "",
  };

  const eventName = event?.name?.trim();
  if (!event || !eventName) return fallback;

  return {
    title: `Sube tus fotos - ${eventName}`,
    description: `Comparte tus mejores fotos y videos de ${eventName}. Solo toma un segundo.`,
    image: buildEventOgImage(event, eventName, eventsUrl),
  };
}

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function asRecord(value: unknown): UnknownRecord {
  return isRecord(value) ? value : {};
}

function recordCandidates(...values: unknown[]): UnknownRecord[] {
  const records: UnknownRecord[] = [];

  for (const value of values) {
    if (!isRecord(value)) continue;
    if (records.includes(value)) continue;
    records.push(value);
  }

  return records;
}

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

function readEventType(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    const record = asRecord(value);
    const name = firstString(
      record.name,
      record.Name,
      record.code,
      record.Code,
    );
    if (name) return name;
  }
  return undefined;
}

function readEventOgRecord(
  event: UnknownRecord,
  data: UnknownRecord,
  eventsUrl?: string,
): EventOgData {
  const rawCover = firstString(
    event.cover_image_url,
    event.coverImageUrl,
    event.coverImageURL,
    event.CoverImageURL,
    event.CoverImageUrl,
    data.cover_image_url,
    data.coverImageUrl,
    data.coverImageURL,
    data.CoverImageURL,
    data.CoverImageUrl,
  );
  const viewCover = firstString(
    event.cover_view_url,
    event.coverViewUrl,
    event.coverViewURL,
    event.CoverViewURL,
    event.CoverViewUrl,
    event.view_url,
    event.viewUrl,
    event.viewURL,
    event.ViewURL,
    event.ViewUrl,
    data.cover_view_url,
    data.coverViewUrl,
    data.coverViewURL,
    data.CoverViewURL,
    data.CoverViewUrl,
    data.view_url,
    data.viewUrl,
    data.viewURL,
    data.ViewURL,
    data.ViewUrl,
  );
  const displayCover = viewCover || rawCover;
  const eventDateTime = firstString(
    event.event_date_time,
    event.eventDateTime,
    event.EventDateTime,
    event.event_date,
    event.eventDate,
    event.EventDate,
    data.event_date_time,
    data.eventDateTime,
    data.EventDateTime,
    data.event_date,
    data.eventDate,
    data.EventDate,
  );

  return {
    name:
      firstString(
        event.name,
        event.Name,
        event.event_name,
        event.eventName,
        event.EventName,
        data.event_name,
        data.eventName,
        data.EventName,
        data.name,
        data.Name,
      ) ?? "",
    identifier: firstString(
      event.identifier,
      event.Identifier,
      event.event_identifier,
      event.eventIdentifier,
      event.EventIdentifier,
      data.identifier,
      data.Identifier,
      data.event_identifier,
      data.eventIdentifier,
      data.EventIdentifier,
    ),
    description: firstString(
      event.description,
      event.Description,
      data.description,
      data.Description,
    ),
    cover_image_url: resolveOgCoverUrl(rawCover || displayCover, eventsUrl),
    cover_view_url: resolveOgCoverUrl(displayCover, eventsUrl),
    cover_view_url_expires_at: firstString(
      event.cover_view_url_expires_at,
      event.coverViewUrlExpiresAt,
      event.coverViewURLExpiresAt,
      event.CoverViewURLExpiresAt,
      event.CoverViewUrlExpiresAt,
      data.cover_view_url_expires_at,
      data.coverViewUrlExpiresAt,
      data.coverViewURLExpiresAt,
      data.CoverViewURLExpiresAt,
      data.CoverViewUrlExpiresAt,
    ),
    view_url: resolveOgCoverUrl(displayCover, eventsUrl),
    view_url_expires_at: firstString(
      event.view_url_expires_at,
      event.viewUrlExpiresAt,
      event.viewURLExpiresAt,
      event.ViewURLExpiresAt,
      event.ViewUrlExpiresAt,
      data.view_url_expires_at,
      data.viewUrlExpiresAt,
      data.viewURLExpiresAt,
      data.ViewURLExpiresAt,
      data.ViewUrlExpiresAt,
    ),
    event_date_time: validOgDate(eventDateTime),
    address: firstString(
      event.address,
      event.Address,
      event.location_name,
      event.locationName,
      event.LocationName,
      data.address,
      data.Address,
      data.location_name,
      data.locationName,
      data.LocationName,
    ),
    second_address: firstString(
      event.second_address,
      event.secondAddress,
      event.SecondAddress,
      data.second_address,
      data.secondAddress,
      data.SecondAddress,
    ),
    timezone: firstString(
      event.timezone,
      event.Timezone,
      event.timeZone,
      event.TimeZone,
      data.timezone,
      data.Timezone,
      data.timeZone,
      data.TimeZone,
    ),
    language: firstString(
      event.language,
      event.Language,
      event.locale,
      event.Locale,
      data.language,
      data.Language,
      data.locale,
      data.Locale,
    ),
    organizer_name: firstString(
      event.organizer_name,
      event.organizerName,
      event.OrganizerName,
      data.organizer_name,
      data.organizerName,
      data.OrganizerName,
    ),
    event_type: readEventType(
      event.event_type,
      event.eventType,
      event.EventType,
      data.event_type,
      data.eventType,
      data.EventType,
    ),
    content_version: firstString(
      event.content_version,
      event.contentVersion,
      event.ContentVersion,
      data.content_version,
      data.contentVersion,
      data.ContentVersion,
    ),
  };
}

function hasEventOgData(event: EventOgData): boolean {
  return Boolean(
    event.name ||
    event.identifier ||
    event.description ||
    event.cover_image_url ||
    event.event_date_time ||
    event.address ||
    event.second_address ||
    event.timezone ||
    event.language ||
    event.organizer_name ||
    event.event_type ||
    event.content_version,
  );
}

function readMetaEventOgData(
  payload: unknown,
  eventsUrl?: string,
): EventOgData | null {
  const data = asRecord(readApiData<unknown>(payload));
  if (Object.keys(data).length === 0) return null;

  const event = readEventOgRecord(data, {}, eventsUrl);
  return hasEventOgData(event) ? event : null;
}

export function readInvitationEventOgData(
  payload: unknown,
  eventsUrl?: string,
): EventOgData | null {
  const root = asRecord(payload);
  const envelopeData = readApiData<unknown>(payload);
  const dataCandidates = recordCandidates(
    envelopeData,
    root.data,
    root.Data,
    root,
  );

  for (const data of dataCandidates) {
    const invitation = asRecord(data.invitation);
    const pascalInvitation = asRecord(data.Invitation);
    const eventCandidates = recordCandidates(
      data.event,
      data.Event,
      invitation.event,
      invitation.Event,
      pascalInvitation.event,
      pascalInvitation.Event,
    );

    for (const event of eventCandidates) {
      if (Object.keys(event).length === 0) continue;

      const eventData = readEventOgRecord(event, data, eventsUrl);
      if (hasEventOgData(eventData)) return eventData;
    }
  }

  return null;
}

export async function fetchInvitationOgData(
  eventsUrl: string,
  token: string,
): Promise<EventOgData | null> {
  const cleanToken = token.trim();
  if (!cleanToken) return null;

  const base = normalizeEventsUrl(eventsUrl);

  try {
    const payload = await fetchApiData<unknown>(
      buildInvitationByTokenUrl(base, cleanToken),
      publicAccessFetchInit(
        { invitationToken: cleanToken },
        {
          signal: AbortSignal.timeout(3000),
        },
      ),
    );
    return readInvitationEventOgData(payload, base);
  } catch {
    return null;
  }
}

/**
 * Fetches event data from the page-spec endpoint for OG meta tags.
 * Best-effort with 3s timeout — returns null on failure.
 */
export async function fetchEventOgData(
  eventsUrl: string,
  identifier: string,
  previewToken = "",
  previewCacheKey = "",
  invitationToken = "",
  accessToken = "",
): Promise<EventOgData | null> {
  const base = normalizeEventsUrl(eventsUrl);
  const previewFetchInit = () =>
    publicAccessFetchInit(
      { previewToken, invitationToken, accessToken },
      { signal: AbortSignal.timeout(3000) },
    );

  try {
    const res = await fetch(
      buildEventMetaUrl(
        base,
        identifier,
        previewToken,
        previewCacheKey,
        invitationToken,
      ),
      previewFetchInit(),
    );
    if (!res.ok) {
      // Fallback only when /meta is not available on an older backend.
      if (!shouldFallbackToPageSpec(res)) return null;
      const specRes = await fetch(
        buildIdentifierPageSpecUrl(
          base,
          identifier,
          previewToken,
          previewCacheKey,
          invitationToken,
        ),
        previewFetchInit(),
      );
      if (!specRes.ok) return null;
      const json = await specRes.json();
      const meta = readPageSpecMetaPayload(json);
      if (!meta) return null;
      const coverViewUrl = meta.coverViewUrl || meta.coverImageUrl;
      const coverViewUrlExpiresAt =
        meta.coverViewUrlExpiresAt || meta.coverImageUrlExpiresAt;
      return {
        name: meta.pageTitle || "",
        identifier: meta.identifier || identifier,
        organizer_name: meta.contact?.name,
        cover_image_url: resolveOgCoverUrl(meta.coverImageUrl, base),
        cover_view_url: resolveOgCoverUrl(coverViewUrl, base),
        cover_view_url_expires_at: coverViewUrlExpiresAt,
        view_url: resolveOgCoverUrl(coverViewUrl, base),
        view_url_expires_at: coverViewUrlExpiresAt,
        event_date_time: validOgDate(meta.eventDateTime ?? meta.eventDate),
        address: meta.address,
        second_address: meta.secondAddress,
        timezone: meta.timezone,
        language: meta.language,
        event_type: meta.eventType,
        content_version: meta.contentVersion,
      };
    }
    const json = await res.json();
    return readMetaEventOgData(json, base);
  } catch {
    return null;
  }
}
