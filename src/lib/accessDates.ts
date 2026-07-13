function validTimeZone(timeZone?: string | null): string | undefined {
  const trimmed = timeZone?.trim();
  if (!trimmed) return undefined;
  try {
    new Intl.DateTimeFormat("es-MX", { timeZone: trimmed }).format(new Date(0));
    return trimmed;
  } catch {
    return undefined;
  }
}

export function formatPublicAccessDateTime(
  value: string,
  timeZone?: string | null,
  { weekday = false }: { weekday?: boolean } = {},
): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  const normalizedTimeZone = validTimeZone(timeZone);
  return new Intl.DateTimeFormat("es-MX", {
    ...(weekday ? { weekday: "long" as const } : {}),
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
    ...(normalizedTimeZone ? { timeZone: normalizedTimeZone } : {}),
  }).format(date);
}
