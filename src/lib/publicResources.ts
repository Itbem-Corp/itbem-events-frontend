import { readApiListPage } from "./apiEnvelope";
import { resolvePublicMediaUrl } from "./mediaUrl";

export interface SectionResource {
  id?: string;
  event_section_id?: string;
  resource_type_id?: string;
  alt_text?: string;
  title: string;
  position: number;
  url?: string;
  view_url: string;
  view_url_expires_at?: string;
  created_at?: string;
}

export interface SectionResourcesPayload {
  sectionId: string;
  sectionResources: SectionResource[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

const SECTION_RESOURCE_LIST_KEYS = [
  "sectionResources",
  "section_resources",
  "SectionResources",
  "resources",
  "Resources",
  "items",
  "Items",
];

function firstNonEmptyString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (trimmed) return trimmed;
  }
  return "";
}

function firstUsefulValue(...values: unknown[]): unknown {
  for (const value of values) {
    if (typeof value === "string") {
      if (value.trim()) return value;
      continue;
    }
    if (value !== undefined && value !== null) return value;
  }
  return undefined;
}

function optionalString(value: unknown): string | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  const trimmed = firstNonEmptyString(value);
  return trimmed || undefined;
}

function optionalDateString(value: unknown): string | undefined {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }
  return optionalString(value);
}

function resourcePosition(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return fallback;
    const parsed = Number(trimmed);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

export function normalizeSectionResource(
  value: unknown,
  eventsUrl: string,
  fallbackPosition = 0,
): SectionResource | null {
  if (!isRecord(value)) return null;

  const rawViewUrl = firstNonEmptyString(
    value.view_url,
    value.viewUrl,
    value.viewURL,
    value.ViewURL,
    value.ViewUrl,
    value.url,
    value.URL,
    value.path,
    value.Path,
    value.object_key,
    value.objectKey,
    value.ObjectKey,
    value.s3_key,
    value.s3Key,
    value.S3Key,
  );
  const viewUrl = resolvePublicMediaUrl(rawViewUrl, eventsUrl);
  if (!viewUrl) return null;

  const rawUrl = firstNonEmptyString(
    value.url,
    value.URL,
    value.view_url,
    value.viewUrl,
    value.viewURL,
    value.ViewURL,
    value.ViewUrl,
  );
  const url = resolvePublicMediaUrl(rawUrl, eventsUrl) || viewUrl;
  const title =
    firstNonEmptyString(value.title, value.Title, value.alt_text, value.altText, value.AltText) || "";

  return {
    id: optionalString(firstUsefulValue(value.id, value.ID, value.Id)),
    event_section_id: optionalString(
      firstUsefulValue(
        value.event_section_id,
        value.eventSectionId,
        value.eventSectionID,
        value.EventSectionID,
        value.EventSectionId,
      ),
    ),
    resource_type_id: optionalString(
      firstUsefulValue(
        value.resource_type_id,
        value.resourceTypeId,
        value.resourceTypeID,
        value.ResourceTypeID,
        value.ResourceTypeId,
      ),
    ),
    alt_text: optionalString(firstUsefulValue(value.alt_text, value.altText, value.AltText)),
    title,
    position: resourcePosition(
      firstUsefulValue(
        value.position,
        value.Position,
        value.order,
        value.Order,
        value.sort_order,
        value.sortOrder,
        value.SortOrder,
      ),
      fallbackPosition,
    ),
    url,
    view_url: viewUrl,
    view_url_expires_at: optionalDateString(
      firstUsefulValue(
        value.view_url_expires_at,
        value.viewUrlExpiresAt,
        value.viewURLExpiresAt,
        value.ViewURLExpiresAt,
        value.ViewUrlExpiresAt,
        value.expires_at,
        value.expiresAt,
        value.ExpiresAt,
      ),
    ),
    created_at: optionalString(firstUsefulValue(value.created_at, value.createdAt, value.CreatedAt)),
  };
}

export function normalizeSectionResources(
  resources: unknown[],
  eventsUrl: string,
): SectionResource[] {
  return resources
    .map((resource, index) =>
      normalizeSectionResource(resource, eventsUrl, index),
    )
    .filter((resource): resource is SectionResource => resource !== null);
}

export function normalizeSectionResourcesPayload(
  value: unknown,
  sectionId: string,
  eventsUrl: string,
): SectionResourcesPayload {
  const sourceResources = readApiListPage<unknown>(value, {
    listKeys: SECTION_RESOURCE_LIST_KEYS,
  }).items;

  return {
    sectionId,
    sectionResources: sortSectionResources(
      normalizeSectionResources(sourceResources, eventsUrl),
    ),
  };
}

export function sortSectionResources(resources: SectionResource[]): SectionResource[] {
  return [...resources].sort((a, b) => {
    if (a.position !== b.position) return a.position - b.position;
    return (a.id ?? "").localeCompare(b.id ?? "");
  });
}

export function resourceAtPosition(
  resources: SectionResource[] | null | undefined,
  position: number,
): SectionResource | undefined {
  return resources?.find((resource) => resource.position === position);
}
