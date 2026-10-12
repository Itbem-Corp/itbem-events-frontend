import { RSVP_CLOSED_MESSAGE } from "./apiError";
import { parsePublicEventDate } from "./eventDate";

/** Backend column sizes for the public RSVP fields (guests table). */
export const RSVP_DIETARY_MAX_LENGTH = 255;
/** rsvp_notes is `text`; requests are bounded so a note can never be unbounded. */
export const RSVP_NOTES_MAX_LENGTH = 500;
/** The guest form keeps a short, readable bound for new notes. */
export const RSVP_NOTES_INPUT_MAX_LENGTH = 180;

export interface RsvpAvailability {
  /** False only when the backend explicitly says RSVPs are closed. */
  open: boolean;
  /** RFC3339 deadline, when the backend sends one. */
  deadline: string | null;
}

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function readOpenFlag(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "false") return false;
    if (normalized === "true") return true;
  }
  return undefined;
}

function readDeadline(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

const OPEN_KEYS = ["rsvp_open", "rsvpOpen", "RSVPOpen"] as const;
const DEADLINE_KEYS = ["rsvp_deadline", "rsvpDeadline", "RSVPDeadline"] as const;

function candidateRecords(source: unknown): UnknownRecord[] {
  if (!isRecord(source)) return [];
  const records: UnknownRecord[] = [source];
  for (const key of ["data", "Data", "event", "Event", "invitation", "Invitation"]) {
    const nested = source[key];
    if (isRecord(nested)) records.push(...candidateRecords(nested));
  }
  return records;
}

/**
 * Reads `rsvp_open` / `rsvp_deadline` from any of the given sources (the
 * invitation payload, the normalised invitation, the section config). When
 * the fields are absent the RSVP is treated as open: the backend still
 * enforces the deadline and answers 403 `rsvp_closed`.
 */
export function readRsvpAvailability(...sources: unknown[]): RsvpAvailability {
  let open: boolean | undefined;
  let deadline: string | undefined;
  for (const source of sources) {
    for (const record of candidateRecords(source)) {
      if (open === undefined) {
        for (const key of OPEN_KEYS) {
          open = readOpenFlag(record[key]);
          if (open !== undefined) break;
        }
      }
      if (deadline === undefined) {
        for (const key of DEADLINE_KEYS) {
          deadline = readDeadline(record[key]);
          if (deadline !== undefined) break;
        }
      }
    }
  }
  return { open: open !== false, deadline: deadline ?? null };
}

function validTimeZone(timeZone?: string | null): string | undefined {
  const trimmed = timeZone?.trim();
  if (!trimmed) return undefined;
  try {
    new Intl.DateTimeFormat("es-ES", { timeZone: trimmed }).format(new Date(0));
    return trimmed;
  } catch {
    return undefined;
  }
}

export function formatRsvpDeadline(
  deadline: string | null | undefined,
  timeZone?: string | null,
): string {
  const parsed = parsePublicEventDate(deadline);
  if (!parsed) return "";
  const zone = validTimeZone(timeZone);
  return new Intl.DateTimeFormat("es-ES", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    ...(zone ? { timeZone: zone } : {}),
  }).format(parsed);
}

export function buildRsvpClosedMessage(
  deadline: string | null | undefined,
  timeZone?: string | null,
): string {
  const formatted = formatRsvpDeadline(deadline, timeZone);
  return formatted
    ? `Las confirmaciones cerraron el ${formatted}.`
    : RSVP_CLOSED_MESSAGE;
}

/** Truncates by code points so the value fits a varchar(n) column. */
export function clampRsvpText(value: string, max: number): string {
  const chars = Array.from(value);
  return chars.length > max ? chars.slice(0, max).join("") : value;
}
