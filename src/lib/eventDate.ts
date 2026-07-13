const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;
const GO_ZERO_DATE_PREFIX = "0001-";

export function parsePublicEventDate(value: string | null | undefined): Date | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith(GO_ZERO_DATE_PREFIX)) return null;

  const candidate = DATE_ONLY_RE.test(trimmed) ? `${trimmed}T12:00:00` : trimmed;
  const parsed = new Date(candidate);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
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

export function formatPublicEventDate(
  value: string | null | undefined,
  timeZone?: string | null,
): string {
  const parsed = parsePublicEventDate(value);
  if (!parsed) return "";

  const normalizedTimeZone = validTimeZone(timeZone);
  return new Intl.DateTimeFormat("es-ES", {
    day: "numeric",
    month: "long",
    year: "numeric",
    ...(normalizedTimeZone ? { timeZone: normalizedTimeZone } : {}),
  }).format(parsed);
}
