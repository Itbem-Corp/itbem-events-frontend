const DEFAULT_EVENTS_URL = "http://localhost:8080/";

export function normalizeEventsUrl(value: string | null | undefined): string {
  const raw = (value ?? DEFAULT_EVENTS_URL).trim() || DEFAULT_EVENTS_URL;
  return `${raw.replace(/\/+$/, "").replace(/\/api$/i, "")}/`;
}

export function eventsUrlOrigin(value: string | null | undefined): string {
  try {
    return new URL(normalizeEventsUrl(value)).origin;
  } catch {
    return "";
  }
}
