import { describe, expect, it } from "vitest";
import {
  buildEventMetaUrl,
  buildEventMomentsUrl,
  buildInvitationByTokenUrl,
  buildPersonalMomentCreateUrl,
  buildResourceUrl,
  buildSectionAttendeesUrl,
  buildSectionResourcesUrl,
  buildSharedMomentCreateUrl,
} from "../../src/lib/apiUrls";
import {
  createApiRuntimeCacheMatcher,
  createFreshFirstApiMatcher,
  createPublicEventPageRuntimeCacheMatcher,
  createS3ImageRuntimeCacheMatcher,
  shouldBypassApiRuntimeCache,
  shouldUseApiRuntimeCache,
  shouldUseFreshFirstApiCache,
  shouldUsePublicEventPageRuntimeCache,
  shouldUseS3ImageRuntimeCache,
} from "../../src/lib/apiCachePolicy.mjs";
import {
  buildIdentifierPageSpecUrl,
  buildTokenPageSpecUrl,
} from "../../src/lib/pageSpecUrl";

describe("apiCachePolicy", () => {
  it("does not runtime-cache access-controlled public GET URL builders", () => {
    const eventsUrl = "https://api.eventiapp.com.mx/";
    const publicUrls = [
      buildIdentifierPageSpecUrl(eventsUrl, "mi evento"),
      buildEventMomentsUrl(eventsUrl, "mi evento", {
        page: 1,
        limit: 20,
      }),
      buildResourceUrl(eventsUrl, "resource 1"),
      buildSectionResourcesUrl(eventsUrl, "section 1"),
      buildSectionAttendeesUrl(eventsUrl, "section 1"),
    ];

    for (const url of publicUrls) {
      expect(shouldBypassApiRuntimeCache(url, eventsUrl), url).toBe(true);
      expect(shouldUseFreshFirstApiCache(url, eventsUrl), url).toBe(false);
      expect(shouldUseApiRuntimeCache(url, eventsUrl), url).toBe(false);
    }
  });

  it("uses fresh-first cache for anonymous public event metadata", () => {
    const eventsUrl = "https://api.eventiapp.com.mx/";
    const url = buildEventMetaUrl(eventsUrl, "mi evento");
    const freshFirst = createFreshFirstApiMatcher(eventsUrl);
    const runtime = createApiRuntimeCacheMatcher(eventsUrl);

    expect(shouldBypassApiRuntimeCache(url, eventsUrl)).toBe(false);
    expect(shouldUseFreshFirstApiCache(url, eventsUrl)).toBe(true);
    expect(shouldUseApiRuntimeCache(url, eventsUrl)).toBe(false);
    expect(freshFirst({ request: { method: "GET" }, url: new URL(url) })).toBe(
      true,
    );
    expect(runtime({ request: { method: "GET" }, url: new URL(url) })).toBe(
      false,
    );

    const stagingUrl =
      "https://staging.example.com/eventi-api/api/events/mi-evento/meta";
    expect(
      shouldUseFreshFirstApiCache(
        stagingUrl,
        "https://staging.example.com/eventi-api",
      ),
    ).toBe(true);
    expect(
      shouldBypassApiRuntimeCache(
        stagingUrl,
        "https://staging.example.com/eventi-api",
      ),
    ).toBe(false);
  });

  it("does not runtime-cache token or preview scoped public access responses", () => {
    const eventsUrl = "https://api.eventiapp.com.mx/";
    const sensitiveUrls = [
      buildTokenPageSpecUrl(eventsUrl, "raw/token 123"),
      buildIdentifierPageSpecUrl(
        eventsUrl,
        "mi evento",
        "preview/token",
        "cache-1",
        "invite/token",
      ),
      buildEventMetaUrl(
        eventsUrl,
        "mi evento",
        "preview/token",
        "cache-1",
        "invite/token",
      ),
      buildEventMomentsUrl(eventsUrl, "mi evento", {
        page: 1,
        limit: 20,
        token: "invite/token",
        preview_token: "preview/token",
      }),
      `${buildEventMomentsUrl(eventsUrl, "mi evento", {
        page: 1,
        limit: 20,
      })}&event_access_token=proof-token`,
      buildInvitationByTokenUrl(eventsUrl, "invite/token"),
      "https://api.eventiapp.com.mx/api/invitations/ByToken/invite-token",
      buildResourceUrl(eventsUrl, "resource 1", {
        token: "invite/token",
        preview_token: "preview/token",
      }),
      buildSectionResourcesUrl(eventsUrl, "section 1", {
        token: "invite/token",
        preview_token: "preview/token",
      }),
      buildSectionAttendeesUrl(eventsUrl, "section 1", {
        token: "invite/token",
        preview_token: "preview/token",
      }),
    ];

    for (const url of sensitiveUrls) {
      expect(shouldBypassApiRuntimeCache(url, eventsUrl), url).toBe(true);
      expect(shouldUseFreshFirstApiCache(url, eventsUrl), url).toBe(false);
      expect(shouldUseApiRuntimeCache(url, eventsUrl), url).toBe(false);
    }
  });

  it("does not runtime-cache public access query aliases accepted by the backend", () => {
    const eventsUrl = "https://api.eventiapp.com.mx/";
    const aliases = [
      "token=invite-token",
      "Token=invite-token",
      "pretty_token=pretty-token",
      "prettyToken=pretty-token",
      "PrettyToken=pretty-token",
      "invitation_token=invite-token",
      "invitationToken=invite-token",
      "InvitationToken=invite-token",
      "preview_token=preview-token",
      "previewToken=preview-token",
      "PreviewToken=preview-token",
      "event_access_token=proof-token",
      "eventAccessToken=proof-token",
      "EventAccessToken=proof-token",
    ];

    for (const query of aliases) {
      const url = `${buildEventMomentsUrl(eventsUrl, "mi evento", {
        page: 1,
        limit: 20,
      })}&${query}`;
      expect(shouldBypassApiRuntimeCache(url, eventsUrl), query).toBe(true);
      expect(shouldUseFreshFirstApiCache(url, eventsUrl), query).toBe(false);
      expect(shouldUseApiRuntimeCache(url, eventsUrl), query).toBe(false);
    }
  });

  it("does not runtime-cache public event page navigations with access tokens", () => {
    const sensitiveUrls = [
      "https://www.eventiapp.com.mx/e/mi-evento?token=invite-token",
      "https://www.eventiapp.com.mx/e/mi-evento?pretty_token=pretty-token",
      "https://www.eventiapp.com.mx/rsvp/mi-evento?invitationToken=invite-token",
      "https://www.eventiapp.com.mx/e/mi-evento?preview_token=preview-token&t=7",
      "https://www.eventiapp.com.mx/rsvp/mi-evento?event_access_token=proof-token",
      "https://preview.example.com/eventi-public/e/mi-evento?previewToken=preview-token",
      "https://preview.example.com/eventi-public/rsvp/mi-evento?Token=invite-token",
    ];
    const request = { mode: "navigate" };
    const matcher = createPublicEventPageRuntimeCacheMatcher();

    for (const url of sensitiveUrls) {
      expect(shouldUsePublicEventPageRuntimeCache(url, request), url).toBe(
        false,
      );
      expect(matcher({ request, url: new URL(url) }), url).toBe(false);
    }
  });

  it("runtime-caches anonymous public event page navigations for offline use", () => {
    const publicUrls = [
      "https://www.eventiapp.com.mx/e/mi-evento",
      "https://www.eventiapp.com.mx/e/mi-evento/momentos",
      "https://www.eventiapp.com.mx/rsvp/mi-evento",
      "https://preview.example.com/eventi-public/e/mi-evento",
      "https://preview.example.com/eventi-public/rsvp/mi-evento",
    ];
    const request = { mode: "navigate" };
    const matcher = createPublicEventPageRuntimeCacheMatcher();

    for (const url of publicUrls) {
      expect(shouldUsePublicEventPageRuntimeCache(url, request), url).toBe(
        true,
      );
      expect(matcher({ request, url: new URL(url) }), url).toBe(true);
    }

    expect(
      shouldUsePublicEventPageRuntimeCache("https://www.eventiapp.com.mx/e/mi-evento"),
    ).toBe(false);
    expect(
      shouldUsePublicEventPageRuntimeCache(
        "https://www.eventiapp.com.mx/events/mi-evento/upload",
        request,
      ),
    ).toBe(false);
  });

  it("runtime-caches only unsigned S3 images", () => {
    const matcher = createS3ImageRuntimeCacheMatcher();
    const unsignedImage =
      "https://eventi-bucket.s3.amazonaws.com/events/cover.webp";
    const sigV4Image =
      "https://eventi-bucket.s3.amazonaws.com/events/cover.webp?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Expires=600&X-Amz-Signature=abc";
    const sigV2Image =
      "https://eventi-bucket.s3.amazonaws.com/events/cover.webp?AWSAccessKeyId=key&Expires=1234567890&Signature=abc";
    const unsignedVideo =
      "https://eventi-bucket.s3.amazonaws.com/events/clip.mp4";

    expect(shouldUseS3ImageRuntimeCache(unsignedImage)).toBe(true);
    expect(matcher({ url: new URL(unsignedImage) })).toBe(true);
    expect(shouldUseS3ImageRuntimeCache(sigV4Image)).toBe(false);
    expect(matcher({ url: new URL(sigV4Image) })).toBe(false);
    expect(shouldUseS3ImageRuntimeCache(sigV2Image)).toBe(false);
    expect(shouldUseS3ImageRuntimeCache(unsignedVideo)).toBe(false);
    expect(
      shouldUseS3ImageRuntimeCache("https://cdn.example.com/events/cover.webp"),
    ).toBe(false);
  });

  it("does not runtime-cache password proof header scoped public access responses", () => {
    const eventsUrl = "https://api.eventiapp.com.mx/";
    const urls = [
      buildEventMetaUrl(eventsUrl, "mi evento"),
      buildEventMomentsUrl(eventsUrl, "mi evento", {
        page: 1,
        limit: 20,
      }),
    ];
    const request = {
      method: "GET",
      headers: new Headers({ "X-Event-Access-Token": "proof-token" }),
    };
    const freshFirst = createFreshFirstApiMatcher(eventsUrl);
    const runtime = createApiRuntimeCacheMatcher(eventsUrl);

    for (const url of urls) {
      expect(shouldBypassApiRuntimeCache(url, eventsUrl, request), url).toBe(
        true,
      );
      expect(
        shouldUseFreshFirstApiCache(url, eventsUrl, "GET", request),
        url,
      ).toBe(false);
      expect(shouldUseApiRuntimeCache(url, eventsUrl, request), url).toBe(
        false,
      );
      expect(freshFirst({ request, url: new URL(url) }), url).toBe(false);
      expect(runtime({ request, url: new URL(url) }), url).toBe(false);
    }
  });

  it("bypasses runtime cache for mutable public event API routes", () => {
    expect(
      shouldUseFreshFirstApiCache(
        "https://api.eventiapp.com.mx/api/events/mi-evento/page-spec",
      ),
    ).toBe(false);
    expect(
      shouldBypassApiRuntimeCache(
        "https://api.eventiapp.com.mx/api/events/mi-evento/page-spec",
      ),
    ).toBe(true);
    expect(
      shouldUseFreshFirstApiCache(
        "https://api.eventiapp.com.mx/api/events/mi-evento/moments?page=1",
      ),
    ).toBe(false);
    expect(
      shouldBypassApiRuntimeCache(
        "https://api.eventiapp.com.mx/api/events/mi-evento/moments?page=1",
      ),
    ).toBe(true);
  });

  it("bypasses runtime cache for anonymous section data that can change from dashboard", () => {
    expect(
      shouldUseFreshFirstApiCache(
        "https://api.eventiapp.com.mx/api/resources/resource-1",
      ),
    ).toBe(false);
    expect(
      shouldBypassApiRuntimeCache(
        "https://api.eventiapp.com.mx/api/resources/resource-1",
      ),
    ).toBe(true);
    expect(
      shouldUseFreshFirstApiCache(
        "https://api.eventiapp.com.mx/api/resources/section/section-1",
      ),
    ).toBe(false);
    expect(
      shouldBypassApiRuntimeCache(
        "https://api.eventiapp.com.mx/api/resources/section/section-1",
      ),
    ).toBe(true);
    expect(
      shouldUseFreshFirstApiCache(
        "https://api.eventiapp.com.mx/api/events/section/section-1/attendees",
      ),
    ).toBe(false);
    expect(
      shouldBypassApiRuntimeCache(
        "https://api.eventiapp.com.mx/api/events/section/section-1/attendees",
      ),
    ).toBe(true);
  });

  it("supports the local Go backend during development", () => {
    expect(
      shouldUseFreshFirstApiCache(
        "http://localhost:8080/api/events/mi-evento/moments?purpose=upload",
      ),
    ).toBe(false);
    expect(
      shouldBypassApiRuntimeCache(
        "http://localhost:8080/api/events/mi-evento/moments?purpose=upload",
      ),
    ).toBe(true);
  });

  it("does not match mutating API requests for runtime cache", () => {
    const freshFirst = createFreshFirstApiMatcher(
      "https://api.eventiapp.com.mx/",
    );
    const runtime = createApiRuntimeCacheMatcher(
      "https://api.eventiapp.com.mx/",
    );
    const urls = [
      new URL(
        buildPersonalMomentCreateUrl(
          "https://api.eventiapp.com.mx",
          "mi-evento",
        ),
      ),
      new URL(
        buildSharedMomentCreateUrl("https://api.eventiapp.com.mx", "mi-evento"),
      ),
    ];

    for (const url of urls) {
      expect(
        freshFirst({ request: { method: "POST" }, url }),
        url.toString(),
      ).toBe(false);
      expect(
        runtime({ request: { method: "POST" }, url }),
        url.toString(),
      ).toBe(false);
    }
  });

  it("supports the configured backend origin and subpath for staging builds", () => {
    expect(
      shouldUseFreshFirstApiCache(
        "https://staging.example.com/eventi-api/api/events/mi-evento/page-spec",
        "https://staging.example.com/eventi-api",
      ),
    ).toBe(false);
    expect(
      shouldBypassApiRuntimeCache(
        "https://staging.example.com/eventi-api/api/events/mi-evento/page-spec",
        "https://staging.example.com/eventi-api",
      ),
    ).toBe(true);
    expect(
      shouldUseFreshFirstApiCache(
        "https://staging.example.com/api/events/mi-evento/page-spec",
        "https://staging.example.com/eventi-api",
      ),
    ).toBe(false);
  });

  it("uses runtime API caching for non-critical routes on the configured backend", () => {
    expect(
      shouldUseApiRuntimeCache(
        "https://staging.example.com/eventi-api/api/events/phrases?type=BODA&count=15",
        "https://staging.example.com/eventi-api/api",
      ),
    ).toBe(true);
  });

  it("leaves non-critical API routes in the generic stale-while-revalidate cache", () => {
    expect(
      shouldUseFreshFirstApiCache(
        "https://api.eventiapp.com.mx/api/events/phrases?type=BODA&count=15",
      ),
    ).toBe(false);
    expect(
      shouldUseFreshFirstApiCache(
        "https://api.eventiapp.com.mx/api/events/mi-evento/moments/shared/upload-url",
      ),
    ).toBe(false);
    expect(
      shouldUseFreshFirstApiCache(
        "https://api.eventiapp.com.mx/api/resources/resource-1/content",
      ),
    ).toBe(false);
    expect(
      shouldUseFreshFirstApiCache(
        "https://other.example.com/api/events/mi-evento/page-spec",
      ),
    ).toBe(false);
  });
});
