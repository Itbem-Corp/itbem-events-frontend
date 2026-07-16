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
