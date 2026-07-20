import { defineMiddleware } from "astro:middleware";

import { applyPublicResponseHeaders } from "./lib/publicResponseHeaders";

const ACCESS_QUERY_KEYS = [
  "preview",
  "preview_token",
  "t",
  "token",
  "invitation_token",
  "access_token",
  "access",
];

function isPublicEventRoute(pathname: string): boolean {
  return pathname.startsWith("/e/") || pathname.startsWith("/rsvp/");
}

export const onRequest = defineMiddleware(async (context, next) => {
  const response = await next();
  response.headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Permissions-Policy", "camera=(self), microphone=(), geolocation=()");
  response.headers.set("Cross-Origin-Opener-Policy", "same-origin");
  response.headers.set("X-Permitted-Cross-Domain-Policies", "none");
  response.headers.set(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https:; img-src 'self' data: blob: https:; media-src 'self' blob: https:; font-src 'self' data: https:; connect-src 'self' https:; frame-src https:; frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'; upgrade-insecure-requests",
  );
  if (!isPublicEventRoute(context.url.pathname)) return response;

  const hasCredential = ACCESS_QUERY_KEYS.some((key) =>
    context.url.searchParams.has(key),
  );

  // URLs carrying any form of invitation/preview/access proof are never
  // browser- or edge-cacheable. Public pages can be briefly cached, while the
  // client and service worker still revalidate their PageSpec promptly.
  applyPublicResponseHeaders(response, hasCredential);
  return response;
});
