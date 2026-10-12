import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildPublicEventOgMeta,
  fetchEventOgData,
  resolveApiOgImageUrl,
  isPresignedMediaUrl,
  resolvePageOgImage,
  stableOgCoverUrl,
} from "../../src/lib/og";

const SIGNED =
  "https://bucket.s3.us-east-2.amazonaws.com/organizations/o/events/e.webp?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=x&X-Amz-Date=20261012T000000Z&X-Amz-Expires=43200&X-Amz-SignedHeaders=host&X-Amz-Signature=abc";

// QA STU-49: og:image carried a presigned cover that expires in 12 h.
describe("stable og:image cover", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("recognises presigned URLs", () => {
    expect(isPresignedMediaUrl(SIGNED)).toBe(true);
    expect(isPresignedMediaUrl("https://cdn.example.com/cover.webp")).toBe(false);
    expect(isPresignedMediaUrl("events/cover.webp")).toBe(false);
  });

  it("never uses a signed view URL, nor the private key behind it", () => {
    expect(
      stableOgCoverUrl(
        {
          cover_view_url: SIGNED,
          view_url: SIGNED,
          cover_image_url: "https://events.example.com/storage/organizations/o/events/e.webp",
        },
        "https://events.example.com",
      ),
    ).toBe("");
  });

  it("prefers a stable public URL when there is one", () => {
    expect(
      stableOgCoverUrl(
        { cover_view_url: SIGNED, cover_image_url: "https://cdn.example.com/cover.webp" },
        "https://events.example.com",
      ),
    ).toBe("https://cdn.example.com/cover.webp");
  });

  it("keeps unsigned covers as before", () => {
    expect(
      stableOgCoverUrl(
        { cover_image_url: "https://events.example.com/storage/events/a/cover.webp" },
        "https://events.example.com",
      ),
    ).toBe("https://events.example.com/storage/events/a/cover.webp");
  });

  it("the dashboard card drops the expiring cover; without a dashboard the page uses og-default", () => {
    const event = { name: "Boda", cover_view_url: SIGNED, view_url: SIGNED, cover_image_url: "https://events.example.com/storage/k.webp" };

    vi.stubEnv("PUBLIC_DASHBOARD_URL", "https://dashboard.example.com");
    const card = new URL(buildPublicEventOgMeta(event, "https://events.example.com").image);
    expect(card.pathname).toBe("/api/og");
    expect(card.searchParams.has("cover")).toBe(false);
    expect(card.href).not.toContain("X-Amz");

    vi.stubEnv("PUBLIC_DASHBOARD_URL", "");
    const plain = buildPublicEventOgMeta(event, "https://events.example.com").image;
    expect(plain).toBe("");
    expect(resolvePageOgImage(plain, "https://www.eventiapp.com.mx/e/boda").url).toBe(
      "https://www.eventiapp.com.mx/og-default.png",
    );
  });
});

// STU-49 backend follow-up: /meta returns og_image_url, a path to the API's
// stable /api/events/:identifier/cover-image route (302 to a fresh URL).
describe("og_image_url from /meta", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  const metaResponse = (data: Record<string, unknown>) =>
    vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ status: 200, message: "ok", data }),
    });

  it("resolves the relative path against the API origin, http(s) only", () => {
    expect(resolveApiOgImageUrl("/api/events/boda/cover-image", "https://api.example.com/api")).toBe(
      "https://api.example.com/api/events/boda/cover-image",
    );
    expect(resolveApiOgImageUrl("javascript:alert(1)", "https://api.example.com")).toBeUndefined();
    expect(resolveApiOgImageUrl("  ", "https://api.example.com")).toBeUndefined();
  });

  it("uses the stable cover route instead of the signed view URL", async () => {
    vi.stubGlobal(
      "fetch",
      metaResponse({
        name: "Boda",
        cover_view_url: SIGNED,
        cover_image_url: "organizations/o/events/e.webp",
        og_image_url: "/api/events/boda/cover-image",
      }),
    );
    const event = await fetchEventOgData("https://api.example.com", "boda");
    expect(event?.og_image_url).toBe("https://api.example.com/api/events/boda/cover-image");

    vi.stubEnv("PUBLIC_DASHBOARD_URL", "https://dashboard.example.com");
    const card = new URL(buildPublicEventOgMeta(event, "https://api.example.com").image);
    expect(card.pathname).toBe("/api/og");
    expect(card.searchParams.get("cover")).toBe("https://api.example.com/api/events/boda/cover-image");

    vi.stubEnv("PUBLIC_DASHBOARD_URL", "");
    expect(buildPublicEventOgMeta(event, "https://api.example.com").image).toBe(
      "https://api.example.com/api/events/boda/cover-image",
    );
  });

  it("falls back to og-default.png when /meta has no og_image_url and only signed covers", async () => {
    vi.stubGlobal("fetch", metaResponse({ name: "Boda", cover_view_url: SIGNED }));
    const event = await fetchEventOgData("https://api.example.com", "boda");
    vi.stubEnv("PUBLIC_DASHBOARD_URL", "");
    const image = buildPublicEventOgMeta(event, "https://api.example.com").image;
    expect(image).toBe("");
    expect(resolvePageOgImage(image, "https://www.eventiapp.com.mx/e/boda").url).toBe(
      "https://www.eventiapp.com.mx/og-default.png",
    );
  });
});
