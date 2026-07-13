function currentLocationSearch(): string {
  return typeof window !== "undefined" ? window.location.search : "";
}

export function publicQueryParams(
  input?: string | URL | URLSearchParams | null,
): URLSearchParams {
  if (input instanceof URLSearchParams) return new URLSearchParams(input);
  if (input instanceof URL) return new URLSearchParams(input.search);

  const raw = input ?? currentLocationSearch();
  const value = raw.trim();
  if (!value) return new URLSearchParams();

  if (value.startsWith("?")) return new URLSearchParams(value);

  if (value.startsWith("#")) {
    const hashQueryStart = value.indexOf("?");
    return new URLSearchParams(
      hashQueryStart === -1 ? value.slice(1) : value.slice(hashQueryStart),
    );
  }

  if (value.includes("?")) {
    try {
      return new URLSearchParams(new URL(value, "https://eventi.local").search);
    } catch {
      return new URLSearchParams(value.slice(value.indexOf("?")));
    }
  }

  return new URLSearchParams(value);
}
