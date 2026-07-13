import { defineMiddleware } from "astro:middleware";

import { hasPublicAccessCredential } from "./lib/publicAccessParams";

// Public URLs may contain short-lived preview, invitation, or password-access
// credentials. Never disclose the current URL through the Referer header when
// a page loads third-party maps, fonts, media, or follows an external link.
export const onRequest = defineMiddleware(async (context, next) => {
  const response = await next();
  response.headers.set("Referrer-Policy", "no-referrer");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set(
    "Permissions-Policy",
    "camera=(self), geolocation=(), microphone=()",
  );
  if (hasPublicAccessCredential(context.url.searchParams)) {
    response.headers.set("Cache-Control", "private, no-store, max-age=0");
    response.headers.set("Pragma", "no-cache");
  }
  return response;
});
