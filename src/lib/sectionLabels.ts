function cleanString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeSectionType(value: unknown): string {
  return cleanString(value)
    .toLowerCase()
    .replace(/[\s_-]+/g, "");
}

function firstNonEmptyString(...values: unknown[]): string {
  for (const value of values) {
    const cleaned = cleanString(value);
    if (cleaned) return cleaned;
  }
  return "";
}

export function isHostsSectionType(sectionType: unknown): boolean {
  switch (normalizeSectionType(sectionType)) {
    case "host":
    case "hosts":
    case "hostsection":
    case "hostssection":
      return true;
    default:
      return false;
  }
}

export function publicAttendeesSectionTitle(
  sectionType: unknown,
  sectionTitle: unknown,
  config: Record<string, unknown> | null | undefined,
): string {
  const explicitTitle = firstNonEmptyString(
    config?.title,
    config?.heading,
    sectionTitle,
  );
  if (explicitTitle) return explicitTitle;

  return isHostsSectionType(sectionType) ? "Anfitriones" : "Graduados";
}
