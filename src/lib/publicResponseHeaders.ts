export function applyPublicResponseHeaders(
  response: Response,
  hasCredential: boolean,
): void {
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set(
    "Referrer-Policy",
    hasCredential ? "no-referrer" : "strict-origin-when-cross-origin",
  );
  response.headers.set(
    "Cache-Control",
    hasCredential
      ? "private, no-store"
      : "public, max-age=60, s-maxage=120, stale-while-revalidate=60",
  );
  if (hasCredential) response.headers.set("Pragma", "no-cache");
  response.headers.set("Vary", "Accept-Encoding");
}
