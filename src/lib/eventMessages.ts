import { formatPublicEventDate } from "./eventDate";

export function cleanEventMessage(
  value: string | undefined,
): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function buildRsvpThankYouMessage(
  eventDate: string,
  customMessage?: string,
  eventTimezone?: string,
): string {
  const cleaned = cleanEventMessage(customMessage);
  if (cleaned) return cleaned;

  const formattedDate = formatPublicEventDate(eventDate, eventTimezone);
  if (!formattedDate) return "Gracias por confirmar tu asistencia";

  return `Gracias por confirmar tu asistencia\nNos vemos el ${formattedDate}`;
}
