/**
 * Defensive readers for section config values.
 *
 * Section config is free-form JSON (the backend only checks that it parses),
 * so a field can arrive as an object, an array, null or a number. Rendering an
 * object as a React child throws and takes the whole section down; these
 * helpers turn anything unexpected into "absent" instead.
 */

export function configText(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return undefined;
}

export function configTextOr(value: unknown, fallback: string): string {
  const text = configText(value);
  return text && text.trim() ? text : fallback;
}

export function configList(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function configRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/** Reads several text fields at once; non-text values come back undefined. */
export function readConfigText<K extends string>(
  config: unknown,
  keys: readonly K[],
): { [P in K]: string | undefined } {
  const record = configRecord(config);
  const result = {} as { [P in K]: string | undefined };
  for (const key of keys) {
    result[key] = configText(record[key]);
  }
  return result;
}
