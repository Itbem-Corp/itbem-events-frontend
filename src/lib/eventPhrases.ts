export interface EventPhrasesResponse {
  phrases: string[];
}

export function normalizeEventPhraseType(eventType: string): string {
  return eventType
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}
