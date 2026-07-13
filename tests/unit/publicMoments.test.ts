import { describe, expect, it } from "vitest";
import {
  getPublicMomentMediaExpiry,
  getPublicMomentsRefreshDelay,
  mergePublicMomentsById,
  normalizePublicMoment,
  normalizePublicMomentUploadResponse,
  normalizePublicMomentsPage,
  PUBLIC_MOMENTS_LIVE_REFRESH_MS,
  publicMomentContentUrl,
  publicMomentsMediaRefreshKey,
  publicMomentPreviewUrl,
  publicMomentThumbnailUrl,
  publicMomentUploadSuccessMessage,
  shouldReplacePublicMomentsOnLiveRefresh,
  shouldShowProcessingStub,
} from "../../src/lib/publicMoments";

function presignedUrl(path: string, date: string, expires: number): string {
  return `https://cdn.example.com/${path}?X-Amz-Date=${date}&X-Amz-Expires=${expires}&X-Amz-Signature=test`;
}

describe("normalizePublicMomentsPage", () => {
  it("normalizes backend public moment pages across casing variants", () => {
    const page = normalizePublicMomentsPage({
      Items: [
        {
          ID: "m1",
          ContentURL: "moments/event/photo.webp",
          ContentURLExpiresAt: "2026-03-01T12:05:00Z",
          ThumbnailURL: "moments/event/thumb.webp",
          ThumbnailURLExpiresAt: "2026-03-01T12:04:00Z",
          ProcessingStatus: "DONE",
          OptimizedSizeBytes: "1200",
          ContentType: "image/webp",
          CreatedAt: "2026-01-01T00:00:00Z",
        },
      ],
      Total: "1",
      HasMore: "false",
      MomentsWallPublished: "true",
      AllowUploads: "false",
      ShareUploadsEnabled: "true",
      UploadsRemaining: "2",
      EventName: "Boda",
      Timezone: "America/Mexico_City",
    });

    expect(page).toMatchObject({
      total: 1,
      has_more: false,
      moments_wall_published: true,
      show_moment_wall: true,
      allow_uploads: false,
      share_uploads_enabled: false,
      uploads_remaining: 2,
      event_name: "Boda",
      timezone: "America/Mexico_City",
    });
    expect(page.items).toHaveLength(1);
    expect(page.items[0]).toMatchObject({
      id: "m1",
      content_url: "moments/event/photo.webp",
      content_url_expires_at: "2026-03-01T12:05:00Z",
      thumbnail_url: "moments/event/thumb.webp",
      thumbnail_url_expires_at: "2026-03-01T12:04:00Z",
      processing_status: "done",
      optimized_size_bytes: 1200,
      content_type: "image/webp",
      created_at: "2026-01-01T00:00:00Z",
    });
  });

  it("normalizes upload flags to the effective public wall state", () => {
    const publishedPage = normalizePublicMomentsPage({
      Published: true,
      AllowUploads: "true",
      ShareUploadsEnabled: "true",
    });

    expect(publishedPage).toMatchObject({
      published: true,
      moments_wall_published: true,
      show_moment_wall: true,
      allow_uploads: false,
      share_uploads_enabled: false,
    });

    const canonicalWinsPage = normalizePublicMomentsPage({
      published: true,
      moments_wall_published: false,
      show_moment_wall: false,
      allow_uploads: true,
      share_uploads_enabled: true,
    });

    expect(canonicalWinsPage).toMatchObject({
      published: true,
      moments_wall_published: false,
      allow_uploads: true,
      share_uploads_enabled: true,
    });

    const disabledPage = normalizePublicMomentsPage({
      allow_uploads: false,
      share_uploads_enabled: true,
    });

    expect(disabledPage).toMatchObject({
      allow_uploads: false,
      share_uploads_enabled: false,
    });
  });

  it("promotes show_moment_wall aliases into the public wall publication state", () => {
    const page = normalizePublicMomentsPage({
      ShowMomentWall: "true",
      AllowUploads: "true",
      ShareUploadsEnabled: "true",
    });

    expect(page).toMatchObject({
      moments_wall_published: true,
      show_moment_wall: true,
      allow_uploads: false,
      share_uploads_enabled: false,
    });
  });

  it("prefers canonical event_date_time while keeping event_date compatibility", () => {
    const page = normalizePublicMomentsPage({
      event_date: "2026-07-04T18:00:00Z",
      eventDateTime: "2026-07-05T18:00:00Z",
    });

    expect(page).toMatchObject({
      event_date: "2026-07-05T18:00:00Z",
      event_date_time: "2026-07-05T18:00:00Z",
    });
  });

  it("drops invalid moments but keeps id-only note moments", () => {
    const page = normalizePublicMomentsPage({
      items: [
        { description: "missing id" },
        { id: "note-1", description: "Gracias por venir" },
      ],
    });

    expect(page.items).toHaveLength(1);
    expect(page.items[0]).toMatchObject({
      id: "note-1",
      content_url: "",
      created_at: "",
      description: "Gracias por venir",
    });
  });

  it("reads backend APIResponse envelopes directly", () => {
    const page = normalizePublicMomentsPage({
      status: 200,
      message: "Moments loaded",
      data: {
        items: [{ id: "m2", content_url: "moments/event/m2.webp" }],
        total: 1,
        allow_uploads: true,
        allow_messages: false,
        share_uploads_enabled: true,
        uploads_limit: 5,
        uploads_used: 2,
        uploads_remaining: 3,
        timezone: "America/Chicago",
      },
    });

    expect(page).toMatchObject({
      total: 1,
      allow_uploads: true,
      allow_messages: false,
      share_uploads_enabled: true,
      uploads_limit: 5,
      uploads_used: 2,
      uploads_remaining: 3,
      timezone: "America/Chicago",
    });
    expect(page.items).toHaveLength(1);
    expect(page.items[0]).toMatchObject({
      id: "m2",
      content_url: "moments/event/m2.webp",
    });
  });

  it("keeps direct paginated page metadata when items live in canonical data", () => {
    const page = normalizePublicMomentsPage({
      data: [{ id: "m-page", content_url: "moments/event/page.webp" }],
      total: "1",
      hasMore: "false",
      allowUploads: "true",
      shareUploadsEnabled: "true",
      nextCursor: "cursor-2",
    });

    expect(page).toMatchObject({
      total: 1,
      has_more: false,
      allow_uploads: true,
      share_uploads_enabled: true,
      next_cursor: "cursor-2",
    });
    expect(page.items).toEqual([
      expect.objectContaining({
        id: "m-page",
        content_url: "moments/event/page.webp",
      }),
    ]);
  });

  it("keeps raw and signed public moment media URLs separated", () => {
    const page = normalizePublicMomentsPage({
      items: [
        {
          Id: "signed-1",
          content_url: "moments/event/raw-photo.webp",
          ContentViewURL: "https://signed.example.com/photo.webp",
          ContentViewURLExpiresAt: "2026-03-01T12:05:00.000Z",
          ThumbnailURL: "moments/event/raw-thumb.webp",
          ThumbnailViewURL: "https://signed.example.com/thumb.webp",
          ThumbnailViewURLExpiresAt: "2026-03-01T12:04:00.000Z",
        },
      ],
    });

    expect(page.items[0]).toMatchObject({
      id: "signed-1",
      content_url: "moments/event/raw-photo.webp",
      content_url_expires_at: undefined,
      content_view_url: "https://signed.example.com/photo.webp",
      content_view_url_expires_at: "2026-03-01T12:05:00.000Z",
      thumbnail_url: "moments/event/raw-thumb.webp",
      thumbnail_url_expires_at: undefined,
      thumbnail_view_url: "https://signed.example.com/thumb.webp",
      thumbnail_view_url_expires_at: "2026-03-01T12:04:00.000Z",
    });
    expect(publicMomentContentUrl(page.items[0])).toBe(
      "https://signed.example.com/photo.webp",
    );
    expect(publicMomentThumbnailUrl(page.items[0])).toBe(
      "https://signed.example.com/thumb.webp",
    );
  });

  it("prefers explicit view aliases when resolving public moment media", () => {
    const moment = normalizePublicMoment({
      id: "signed-2",
      content_url: "moments/event/raw-photo.webp",
      content_view_url: "https://signed.example.com/photo.webp",
      thumbnail_url: "moments/event/raw-thumb.webp",
      thumbnail_view_url: "https://signed.example.com/thumb.webp",
    });

    expect(moment).not.toBeNull();
    expect(publicMomentContentUrl(moment!)).toBe(
      "https://signed.example.com/photo.webp",
    );
    expect(publicMomentThumbnailUrl(moment!)).toBe(
      "https://signed.example.com/thumb.webp",
    );
    expect(publicMomentPreviewUrl(moment!)).toBe(
      "https://signed.example.com/thumb.webp",
    );
    expect(publicMomentsMediaRefreshKey([moment!])).toContain(
      "https://signed.example.com/photo.webp",
    );
  });

  it("reads nested data arrays from adapter payloads", () => {
    const page = normalizePublicMomentsPage({
      Data: [
        { ID: "m3", ContentURL: "moments/event/m3.webp" },
        { Description: "missing id" },
      ],
    });

    expect(page.items).toEqual([
      expect.objectContaining({
        id: "m3",
        content_url: "moments/event/m3.webp",
      }),
    ]);
  });

  it("reads nested data page objects from adapter payloads", () => {
    const page = normalizePublicMomentsPage({
      data: {
        Items: [{ ID: "m4", ContentURL: "moments/event/m4.webp" }],
        Total: "1",
        HasMore: "false",
      },
    });

    expect(page.total).toBe(1);
    expect(page.has_more).toBe(false);
    expect(page.items).toEqual([
      expect.objectContaining({
        id: "m4",
        content_url: "moments/event/m4.webp",
      }),
    ]);
  });

  it("uses non-empty moment list aliases before empty canonical list aliases", () => {
    const page = normalizePublicMomentsPage({
      Status: 200,
      Message: "Moments loaded",
      data: [],
      Data: {
        items: [],
        Items: [{ ID: "m5", ContentURL: "moments/event/m5.webp" }],
      },
    });

    expect(page.items).toEqual([
      expect.objectContaining({
        id: "m5",
        content_url: "moments/event/m5.webp",
      }),
    ]);
  });

  it("uses useful direct Data pages before empty canonical data pages", () => {
    const page = normalizePublicMomentsPage({
      Status: 200,
      Message: "Moments loaded",
      data: {
        items: [],
      },
      Data: {
        Items: [{ ID: "m6", ContentURL: "moments/event/m6.webp" }],
        Total: "1",
        Published: "true",
      },
    });

    expect(page.total).toBe(1);
    expect(page.published).toBe(true);
    expect(page.items).toEqual([
      expect.objectContaining({
        id: "m6",
        content_url: "moments/event/m6.webp",
      }),
    ]);
  });

  it("uses useful Data page metadata before empty canonical data page metadata", () => {
    const page = normalizePublicMomentsPage({
      data: {
        items: [],
      },
      Data: {
        Total: "0",
        HasMore: "false",
        AllowUploads: "true",
        ShareUploadsEnabled: "true",
      },
    });

    expect(page).toMatchObject({
      total: 0,
      has_more: false,
      allow_uploads: true,
      share_uploads_enabled: true,
      items: [],
    });
  });

  it("returns an empty item list for malformed payloads", () => {
    expect(normalizePublicMomentsPage(null).items).toEqual([]);
    expect(normalizePublicMomentsPage({ items: "bad" }).items).toEqual([]);
  });

  it("ignores blank numeric aliases instead of treating them as zero", () => {
    const page = normalizePublicMomentsPage({
      items: [
        {
          id: "m1",
          content_url: "moments/event/photo.webp",
          order: " ",
          optimizedSizeBytes: "",
        },
      ],
      total: "",
      uploads_remaining: " ",
    });

    expect(page.total).toBeUndefined();
    expect(page.uploads_remaining).toBeUndefined();
    expect(page.items[0]).toMatchObject({
      id: "m1",
      order: undefined,
      optimized_size_bytes: undefined,
    });
  });

  it("falls back to later aliases when canonical fields are null", () => {
    const page = normalizePublicMomentsPage({
      items: [
        {
          id: "m-null",
          title: null,
          Title: "Fallback title",
          description: undefined,
          Description: "Fallback description",
          created_at: null,
          CreatedAt: "2026-01-01T00:00:00Z",
        },
      ],
      allow_uploads: null,
      AllowUploads: true,
      share_uploads_enabled: undefined,
      ShareUploadsEnabled: true,
      moments_wall_published: null,
      MomentsWallPublished: false,
      uploads_remaining: null,
      UploadsRemaining: "2",
    });

    expect(page).toMatchObject({
      allow_uploads: true,
      share_uploads_enabled: true,
      moments_wall_published: false,
      show_moment_wall: false,
      uploads_remaining: 2,
    });
    expect(page.items[0]).toMatchObject({
      id: "m-null",
      title: "Fallback title",
      description: "Fallback description",
      created_at: "2026-01-01T00:00:00Z",
    });
  });

  it("falls back to later aliases when canonical fields are blank", () => {
    const page = normalizePublicMomentsPage({
      items: [
        {
          id: " ",
          ID: "m-blank",
          title: " ",
          Title: "Fallback title",
          description: " ",
          Description: "Fallback description",
          content_view_url: " ",
          ContentViewURL: "https://signed.example.com/photo.webp",
          content_view_url_expires_at: " ",
          ContentViewURLExpiresAt: "2026-03-01T12:05:00.000Z",
          thumbnail_view_url: " ",
          ThumbnailViewURL: "https://signed.example.com/thumb.webp",
          created_at: " ",
          CreatedAt: "2026-01-01T00:00:00Z",
          order: " ",
          Order: "4",
          processing_status: " ",
          ProcessingStatus: "done",
        },
      ],
      allow_uploads: " ",
      AllowUploads: true,
      next_cursor: " ",
      NextCursor: "cursor-2",
      event_date_time: " ",
      EventDateTime: "2026-08-15T20:30:00-06:00",
    });

    expect(page).toMatchObject({
      allow_uploads: true,
      next_cursor: "cursor-2",
      event_date_time: "2026-08-15T20:30:00-06:00",
    });
    expect(page.items[0]).toMatchObject({
      id: "m-blank",
      title: "Fallback title",
      description: "Fallback description",
      content_view_url: "https://signed.example.com/photo.webp",
      content_view_url_expires_at: "2026-03-01T12:05:00.000Z",
      thumbnail_view_url: "https://signed.example.com/thumb.webp",
      created_at: "2026-01-01T00:00:00Z",
      order: 4,
      processing_status: "done",
    });
  });
});

describe("normalizePublicMoment", () => {
  it("preserves legacy empty processing status and rejects unknown statuses", () => {
    expect(
      normalizePublicMoment({ id: "legacy", processing_status: "" }),
    ).toMatchObject({ processing_status: "" });
    expect(
      normalizePublicMoment({ id: "bad-status", processingStatus: "ready" }),
    ).toMatchObject({ processing_status: undefined });
  });

  it("normalizes upload response publication statuses and derives guest-facing hints", () => {
    const pendingReview = normalizePublicMomentUploadResponse({
      status: 201,
      data: {
        id: "manual-review",
        approval_status: "pending_review",
        publication_status: "pending_review",
      },
    });
    expect(pendingReview).toMatchObject({
      approval_status: "pending_review",
      publication_status: "pending_review",
    });
    expect(shouldShowProcessingStub(pendingReview)).toBe(false);
    expect(publicMomentUploadSuccessMessage(pendingReview)).toContain(
      "cuando sea aprobado",
    );

    const processing = normalizePublicMomentUploadResponse({
      Data: {
        ID: "auto-approved",
        ApprovalStatus: "APPROVED",
        PublicationStatus: "PROCESSING",
        ProcessingStatus: "pending",
      },
    });
    expect(processing).toMatchObject({
      approval_status: "approved",
      publication_status: "processing",
      processing_status: "pending",
    });
    expect(shouldShowProcessingStub(processing)).toBe(true);
    expect(publicMomentUploadSuccessMessage(processing)).toContain(
      "termine de procesarse",
    );

    const published = normalizePublicMomentUploadResponse({
      data: {
        id: "published",
        approvalStatus: "approved",
        publicationStatus: "published",
      },
    });
    expect(shouldShowProcessingStub(published)).toBe(false);
    expect(publicMomentUploadSuccessMessage(published)).toContain(
      "disponible en el muro",
    );
  });

  it("accepts worker-friendly upload responses with a nested public_moment", () => {
    const moment = normalizePublicMomentUploadResponse({
      status: 201,
      data: {
        public_moment: {
          id: "worker-response",
          content_url: "moments/event/optimized/photo.webp",
          approval_status: "approved",
          publication_status: "processing",
          processing_status: "pending",
        },
        uploads_remaining: 2,
      },
    });

    expect(moment).toMatchObject({
      id: "worker-response",
      content_url: "moments/event/optimized/photo.webp",
      approval_status: "approved",
      publication_status: "processing",
      processing_status: "pending",
    });
    expect(publicMomentUploadSuccessMessage(moment)).toContain(
      "termine de procesarse",
    );
  });

  it("accepts Pascal-cased upload envelopes with a nested public_moment", () => {
    const moment = normalizePublicMomentUploadResponse({
      Status: 201,
      Message: "Moment submitted for review",
      Data: {
        public_moment: {
          id: "adapter-response",
          content_url: "moments/event/optimized/photo.webp",
          approval_status: "approved",
          publication_status: "processing",
          processing_status: "pending",
        },
        uploads_remaining: 1,
      },
    });

    expect(moment).toMatchObject({
      id: "adapter-response",
      approval_status: "approved",
      publication_status: "processing",
      processing_status: "pending",
    });
  });

  it("preserves signed view URLs from immediate upload confirmations", () => {
    const moment = normalizePublicMomentUploadResponse({
      status: 201,
      message: "Moment submitted for review",
      data: {
        id: "signed-confirm",
        content_url: "moments/event/raw/photo.webp",
        content_view_url: "https://signed.example.com/photo.webp",
        content_view_url_expires_at: "2026-03-01T12:05:00.000Z",
        approval_status: "approved",
        publication_status: "processing",
        processing_status: "pending",
      },
    });

    expect(moment).not.toBeNull();
    expect(publicMomentContentUrl(moment!)).toBe(
      "https://signed.example.com/photo.webp",
    );
    expect(getPublicMomentMediaExpiry(moment!)?.toISOString()).toBe(
      "2026-03-01T12:05:00.000Z",
    );
  });
});

describe("public moment media expiry", () => {
  it("uses a lightweight cadence for live public wall refreshes", () => {
    expect(PUBLIC_MOMENTS_LIVE_REFRESH_MS).toBe(30_000);
  });

  it("uses explicit backend expiration metadata before URL parsing", () => {
    const moment = normalizePublicMoment({
      id: "moment-1",
      content_url: presignedUrl("photo.webp", "20260301T120000Z", 3600),
      content_url_expires_at: "2026-03-01T12:05:00.000Z",
    });

    expect(moment).not.toBeNull();
    expect(getPublicMomentMediaExpiry(moment!)?.toISOString()).toBe(
      "2026-03-01T12:05:00.000Z",
    );
  });

  it("prefers explicit view URL expiration metadata over legacy content fields", () => {
    const moment = normalizePublicMoment({
      id: "moment-1",
      content_url: "moments/event/raw-photo.webp",
      content_view_url: presignedUrl("photo.webp", "20260301T120000Z", 600),
      content_view_url_expires_at: "2026-03-01T12:04:00.000Z",
    });

    expect(moment).not.toBeNull();
    expect(moment).toMatchObject({
      content_url: "moments/event/raw-photo.webp",
      content_view_url: expect.stringContaining("X-Amz-Date=20260301T120000Z"),
      content_url_expires_at: undefined,
      content_view_url_expires_at: "2026-03-01T12:04:00.000Z",
    });
    expect(getPublicMomentMediaExpiry(moment!)?.toISOString()).toBe(
      "2026-03-01T12:04:00.000Z",
    );
  });

  it("falls back to AWS presigned URL expiration parsing", () => {
    const moment = normalizePublicMoment({
      id: "moment-1",
      content_url: presignedUrl("photo.webp", "20260301T120000Z", 120),
    });

    expect(moment).not.toBeNull();
    expect(getPublicMomentMediaExpiry(moment!)?.toISOString()).toBe(
      "2026-03-01T12:02:00.000Z",
    );
  });

  it("refreshes before the earliest content or thumbnail URL expires", () => {
    const now = Date.parse("2026-03-01T12:00:00.000Z");
    const moments = normalizePublicMomentsPage({
      items: [
        {
          id: "later",
          content_url: presignedUrl("later.webp", "20260301T120000Z", 600),
        },
        {
          id: "earlier",
          content_url: "https://cdn.example.com/content.webp",
          content_url_expires_at: "2026-03-01T12:05:00.000Z",
          thumbnail_url: "https://cdn.example.com/thumb.webp",
          thumbnail_url_expires_at: "2026-03-01T12:03:00.000Z",
        },
      ],
    }).items;

    expect(getPublicMomentsRefreshDelay(moments, now, 60_000)).toBe(120_000);
  });

  it("builds a stable refresh key from public moment media fields", () => {
    const moments = normalizePublicMomentsPage({
      items: [
        {
          id: "moment-1",
          content_url: "https://cdn.example.com/content.webp",
          content_url_expires_at: "2026-03-01T12:05:00.000Z",
          thumbnail_url: "https://cdn.example.com/thumb.webp",
          thumbnail_url_expires_at: "2026-03-01T12:04:00.000Z",
        },
      ],
    }).items;

    expect(publicMomentsMediaRefreshKey(moments)).toBe(
      "moment-1:https://cdn.example.com/content.webp:2026-03-01T12:05:00.000Z:https://cdn.example.com/thumb.webp:2026-03-01T12:04:00.000Z",
    );
  });
});

describe("mergePublicMomentsById", () => {
  it("deduplicates duplicate moments within the incoming page", () => {
    const incoming = normalizePublicMomentsPage({
      items: [
        { id: "a", content_url: "moments/a-old.webp" },
        { id: "a", content_url: "moments/a-new.webp" },
        { id: "b", content_url: "moments/b.webp" },
      ],
    }).items;

    expect(mergePublicMomentsById([], incoming)).toEqual([
      expect.objectContaining({ id: "a", content_url: "moments/a-new.webp" }),
      expect.objectContaining({ id: "b" }),
    ]);
  });

  it("appends pages without duplicating overlapping moments and keeps fresher media", () => {
    const existing = normalizePublicMomentsPage({
      items: [
        {
          id: "a",
          content_url: "moments/a.webp",
          content_view_url: "https://signed.example.com/a-old.webp",
        },
        { id: "b", content_url: "moments/b.webp" },
      ],
    }).items;
    const incoming = normalizePublicMomentsPage({
      items: [
        {
          id: "b",
          content_url: "moments/b.webp",
          content_view_url: "https://signed.example.com/b-new.webp",
        },
        { id: "c", content_url: "moments/c.webp" },
      ],
    }).items;

    expect(mergePublicMomentsById(existing, incoming)).toEqual([
      expect.objectContaining({ id: "a" }),
      expect.objectContaining({
        id: "b",
        content_view_url: "https://signed.example.com/b-new.webp",
      }),
      expect.objectContaining({ id: "c" }),
    ]);
  });

  it("can prepend refreshed page-one moments while preserving the loaded tail", () => {
    const existing = normalizePublicMomentsPage({
      items: [
        { id: "b", content_url: "moments/b-old.webp" },
        { id: "c", content_url: "moments/c.webp" },
      ],
    }).items;
    const incoming = normalizePublicMomentsPage({
      items: [
        { id: "a", content_url: "moments/a.webp" },
        { id: "b", content_url: "moments/b-new.webp" },
      ],
    }).items;

    const merged = mergePublicMomentsById(existing, incoming, {
      prependIncoming: true,
      limit: 2,
    });

    expect(merged).toEqual([
      expect.objectContaining({ id: "a" }),
      expect.objectContaining({ id: "b", content_url: "moments/b-new.webp" }),
    ]);
  });

  it("knows when live refresh must replace stale public moments", () => {
    const existing = normalizePublicMomentsPage({
      items: [
        { id: "a", content_url: "moments/a.webp" },
        { id: "b", content_url: "moments/b.webp" },
      ],
    }).items;
    const sameHead = normalizePublicMomentsPage({
      items: [
        { id: "a", content_url: "moments/a-new.webp" },
        { id: "b", content_url: "moments/b.webp" },
      ],
    }).items;
    const changedHead = normalizePublicMomentsPage({
      items: [
        { id: "c", content_url: "moments/c.webp" },
        { id: "a", content_url: "moments/a.webp" },
      ],
    }).items;

    expect(
      shouldReplacePublicMomentsOnLiveRefresh(2, 3, existing, changedHead),
    ).toBe(false);
    expect(
      shouldReplacePublicMomentsOnLiveRefresh(2, 2, existing, sameHead),
    ).toBe(false);
    expect(
      shouldReplacePublicMomentsOnLiveRefresh(2, 2, existing, changedHead),
    ).toBe(true);
    expect(
      shouldReplacePublicMomentsOnLiveRefresh(2, 1, existing, sameHead),
    ).toBe(true);
  });
});
