import { defineMiddleware } from "astro:middleware";

import { applyPublicResponseHeaders } from "./lib/publicResponseHeaders";
import { hasCredentialQuery, isPublicEventRoute } from "./lib/publicRouteCredentials";
import {
  buildContentSecurityPolicy,
  isStudioPreviewRequest,
  studioPreviewFrameAncestors,
  withFrameAncestors,
} from "./lib/contentSecurityPolicy";
import { PUBLIC_PRODUCT } from "./config/public-product";

// Production builds always get the HTTPS-only policy; only `astro dev` with a
// loopback HTTP API (the local stack) allows that origin.
const CONTENT_SECURITY_POLICY = buildContentSecurityPolicy({
  dev: import.meta.env.DEV === true,
  eventsUrl: import.meta.env.PUBLIC_EVENTS_URL as string | undefined,
});

// The Studio preview (event page + preview token) may be framed by the
// dashboard only; every other response stays unframeable.
const STUDIO_PREVIEW_CONTENT_SECURITY_POLICY = withFrameAncestors(
  CONTENT_SECURITY_POLICY,
  studioPreviewFrameAncestors({
    dev: import.meta.env.DEV === true,
    dashboardHostname: PUBLIC_PRODUCT.dashboardHostname,
  }),
);

export const onRequest = defineMiddleware(async (context, next) => {
  const response = await next();
  response.headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
  response.headers.set("X-Content-Type-Options", "nosniff");
  const studioPreview = isStudioPreviewRequest(context.url);
  if (studioPreview) {
    // CSP frame-ancestors decides; X-Frame-Options has no allow-list form.
    response.headers.delete("X-Frame-Options");
  } else {
    response.headers.set("X-Frame-Options", "DENY");
  }
  response.headers.set("Permissions-Policy", "camera=(self), microphone=(), geolocation=()");
  response.headers.set("Cross-Origin-Opener-Policy", "same-origin");
  response.headers.set("X-Permitted-Cross-Domain-Policies", "none");
  response.headers.set(
    "Content-Security-Policy",
    studioPreview ? STUDIO_PREVIEW_CONTENT_SECURITY_POLICY : CONTENT_SECURITY_POLICY,
  );
  if (!isPublicEventRoute(context.url.pathname)) return response;

  const hasCredential = hasCredentialQuery(context.url.searchParams);

  // URLs carrying any form of invitation/preview/access proof are never
  // browser- or edge-cacheable. Public pages can be briefly cached, while the
  // client and service worker still revalidate their PageSpec promptly.
  applyPublicResponseHeaders(response, hasCredential);
  return response;
});
