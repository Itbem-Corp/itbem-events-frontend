/**
 * The site's Content-Security-Policy. Production is HTTPS-only and must stay
 * byte-identical to `public/_headers`. Only a dev build pointed at a loopback
 * HTTP API (the local stack) gets that one origin added, so the site can be
 * tested in a browser against http://localhost:18080.
 */
export const PRODUCTION_CSP =
  "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https:; img-src 'self' data: blob: https:; media-src 'self' blob: https:; font-src 'self' data: https:; connect-src 'self' https:; frame-src https:; frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'; upgrade-insecure-requests";

function isLoopbackHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  return (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host === "127.0.0.1" ||
    host === "::1"
  );
}

/** The API origin when it is plain HTTP on a loopback host, else null. */
export function loopbackHttpOrigin(eventsUrl: string | null | undefined): string | null {
  const raw = eventsUrl?.trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:") return null;
    if (!isLoopbackHostname(url.hostname)) return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function buildContentSecurityPolicy({
  dev,
  eventsUrl,
}: {
  dev: boolean;
  eventsUrl?: string | null;
}): string {
  const origin = dev ? loopbackHttpOrigin(eventsUrl) : null;
  if (!origin) return PRODUCTION_CSP;

  return PRODUCTION_CSP.split("; ")
    .flatMap((directive) => {
      const [name] = directive.split(" ");
      if (name === "connect-src") {
        // The API, plus the Vite HMR socket on loopback.
        return [`${directive} ${origin} ws://localhost:* ws://127.0.0.1:*`];
      }
      if (name === "img-src" || name === "media-src") {
        // Media URLs relative to the API resolve to the loopback origin.
        return [`${directive} ${origin}`];
      }
      // Upgrading would turn http://localhost:18080 into an https URL that
      // does not exist locally.
      if (name === "upgrade-insecure-requests") return [];
      return [directive];
    })
    .join("; ");
}
