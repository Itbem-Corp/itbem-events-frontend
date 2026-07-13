import { describe, expect, it } from "vitest";
import {
  PUBLIC_ATTENDEES_CACHE_TTL_MS,
  SECTION_RESOURCE_CACHE_MAX_TTL_MS,
  getPresignedExpiry,
  publicAccessCacheNamespace,
  getResourceViewUrlExpiry,
  getSectionResourcesCacheExpiry,
  getSectionResourcesRefreshDelay,
  publicAccessCacheScope,
  publicAccessScopedCacheKey,
  sectionResourcesCacheKey,
  sectionResourcesExpiryKey,
  sectionResourcesMediaRefreshKey,
} from "../../src/lib/resourceCache";

function presignedUrl(date: string, expires: number): string {
  return (
    "https://bucket.example.com/events/image.webp" +
    `?X-Amz-Date=${date}` +
    `&X-Amz-Expires=${expires}` +
    "&X-Amz-Signature=fake"
  );
}

describe("resourceCache", () => {
  it("keeps public attendee freshness aligned with section resources", () => {
    expect(PUBLIC_ATTENDEES_CACHE_TTL_MS).toBe(
      SECTION_RESOURCE_CACHE_MAX_TTL_MS,
    );
  });

  it("builds section resource cache keys", () => {
    expect(sectionResourcesCacheKey("section-1")).toBe(
      "resourcesBySection-section-1",
    );
    expect(sectionResourcesExpiryKey("section-1")).toBe(
      "resourcesExpiry-section-1",
    );
  });

  it("isolates section caches by backend namespace", () => {
    const namespace = publicAccessCacheNamespace("https://api.example.com/api/");

    expect(namespace).toMatch(/^api-[a-z0-9]+$/);
    expect(namespace).not.toContain("api.example.com");
    expect(sectionResourcesCacheKey("section-1", "public", "https://api.example.com/api/")).toBe(
      `resourcesBySection-${namespace}-section-1`,
    );
    expect(sectionResourcesExpiryKey("section-1", "public", "https://api.example.com/api/")).toBe(
      `resourcesExpiry-${namespace}-section-1`,
    );
  });

  it("scopes public caches by access token without exposing raw token values", () => {
    const scope = publicAccessCacheScope({ invitationToken: " invite/secret " });
    const namespace = publicAccessCacheNamespace("https://api.example.com/");

    expect(scope).toMatch(/^invite-[a-z0-9]+$/);
    expect(scope).not.toContain("secret");
    expect(sectionResourcesCacheKey("section-1", scope, "https://api.example.com/")).toBe(
      `resourcesBySection-${namespace}-section-1-${scope}`,
    );
    expect(sectionResourcesExpiryKey("section-1", scope, "https://api.example.com/")).toBe(
      `resourcesExpiry-${namespace}-section-1-${scope}`,
    );
    expect(publicAccessScopedCacheKey("attendees", "section-1", scope, "https://api.example.com/")).toBe(
      `attendees-${namespace}-section-1-${scope}`,
    );
  });

  it("includes password access proof in public cache scope", () => {
    const scope = publicAccessCacheScope({
      invitationToken: " invite/secret ",
      accessToken: " proof/secret ",
    });

    expect(scope).toMatch(/^invite-[a-z0-9]+-access-[a-z0-9]+$/);
    expect(scope).not.toContain("secret");
  });

  it("includes a public content version in section cache scope without exposing raw timestamps", () => {
    const scope = publicAccessCacheScope({
      cacheKey: "2026-07-07T20:30:00.123Z",
    });

    expect(scope).toMatch(/^v-[a-z0-9]+$/);
    expect(scope).not.toContain("2026");
    expect(sectionResourcesCacheKey("section-1", scope, "https://api.example.com/")).toContain(
      `section-1-${scope}`,
    );
  });

  it("keeps preview token scopes independent from cache-busting values", () => {
    expect(
      publicAccessCacheScope({
        previewToken: "preview-token",
        cacheKey: "2026-07-07T20:30:00.123Z",
      }),
    ).toBe(publicAccessCacheScope({ previewToken: "preview-token" }));
  });

  it("parses AWS presigned URL expiry", () => {
    const expiry = getPresignedExpiry(
      presignedUrl("20260301T120000Z", 60),
    );

    expect(expiry?.toISOString()).toBe("2026-03-01T12:01:00.000Z");
  });

  it("parses signed epoch-second URL expirations conservatively", () => {
    const expires = Math.floor(Date.parse("2026-03-01T12:03:00.000Z") / 1000);

    expect(
      getPresignedExpiry(
        `https://cdn.example.com/photo.webp?Expires=${expires}&Signature=sig&Key-Pair-Id=key`,
      )?.toISOString(),
    ).toBe("2026-03-01T12:03:00.000Z");
    expect(
      getPresignedExpiry(`https://cdn.example.com/photo.webp?Expires=${expires}`),
    ).toBeNull();
  });

  it("caps resource cache freshness even when presigned URLs last for hours", () => {
    const now = new Date("2026-03-01T12:00:00.000Z");
    const expiry = getSectionResourcesCacheExpiry(
      [{ view_url: presignedUrl("20260301T120000Z", 21_600) }],
      now,
    );

    expect(expiry.getTime() - now.getTime()).toBe(
      SECTION_RESOURCE_CACHE_MAX_TTL_MS,
    );
  });

  it("uses the earliest presigned expiry when it is sooner than the freshness cap", () => {
    const now = new Date("2026-03-01T12:00:00.000Z");
    const expiry = getSectionResourcesCacheExpiry(
      [
        { view_url: presignedUrl("20260301T120000Z", 120) },
        { view_url: presignedUrl("20260301T120000Z", 21_600) },
      ],
      now,
    );

    expect(expiry.toISOString()).toBe("2026-03-01T12:02:00.000Z");
  });

  it("prefers the backend-provided view URL expiry over provider-specific query parsing", () => {
    const expiry = getResourceViewUrlExpiry({
      view_url: presignedUrl("20260301T120000Z", 21_600),
      view_url_expires_at: "2026-03-01T12:03:00.000Z",
    });

    expect(expiry?.toISOString()).toBe("2026-03-01T12:03:00.000Z");
  });

  it("uses legacy URL aliases when computing resource freshness", () => {
    const now = Date.parse("2026-03-01T12:00:00.000Z");

    expect(
      getResourceViewUrlExpiry({
        url: presignedUrl("20260301T120000Z", 600),
      })?.toISOString(),
    ).toBe("2026-03-01T12:10:00.000Z");

    expect(
      getSectionResourcesRefreshDelay(
        [
          {
            URL: "https://cdn.example.com/static.webp",
            ViewURLExpiresAt: "2026-03-01T12:03:00.000Z",
          },
        ],
        now,
        60_000,
      ),
    ).toBe(120_000);

    expect(
      sectionResourcesMediaRefreshKey([
        {
          ViewURL: "https://signed.example.com/legacy.webp",
          ViewURLExpiresAt: "2026-03-01T12:05:00.000Z",
        },
      ]),
    ).toBe(
      "https://signed.example.com/legacy.webp:2026-03-01T12:05:00.000Z",
    );
  });

  it("uses explicit backend expiry when choosing section cache freshness", () => {
    const now = new Date("2026-03-01T12:00:00.000Z");
    const expiry = getSectionResourcesCacheExpiry(
      [{ view_url: "https://cdn.example.com/image.webp", view_url_expires_at: "2026-03-01T12:04:00.000Z" }],
      now,
    );

    expect(expiry.toISOString()).toBe("2026-03-01T12:04:00.000Z");
  });

  it("computes refresh delay before the earliest resource URL expires", () => {
    const now = Date.parse("2026-03-01T12:00:00.000Z");

    expect(
      getSectionResourcesRefreshDelay(
        [
          { view_url: presignedUrl("20260301T120000Z", 600) },
          {
            view_url: "https://cdn.example.com/image.webp",
            view_url_expires_at: "2026-03-01T12:03:00.000Z",
          },
        ],
        now,
        60_000,
      ),
    ).toBe(120_000);
  });

  it("builds a stable media refresh key from resource URLs and expirations", () => {
    expect(
      sectionResourcesMediaRefreshKey([
        {
          view_url: "https://cdn.example.com/image.webp",
          view_url_expires_at: "2026-03-01T12:03:00.000Z",
        },
      ]),
    ).toBe("https://cdn.example.com/image.webp:2026-03-01T12:03:00.000Z");
  });
});
