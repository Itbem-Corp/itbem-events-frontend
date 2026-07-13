import { describe, expect, it } from "vitest";
import {
  buildApiUrl,
  buildEventApiUrl,
  buildEventMetaUrl,
  buildEventMomentsUrl,
  buildEventPhrasesUrl,
  buildEventVerifyAccessUrl,
  buildInvitationByTokenUrl,
  buildPersonalMomentCreateUrl,
  buildPersonalMomentConfirmUrl,
  buildPersonalMomentUploadUrl,
  buildResourceUrl,
  buildRsvpUrl,
  buildSectionAttendeesUrl,
  buildSectionResourcesUrl,
  buildSharedMomentCreateUrl,
  buildSharedMomentBatchUploadUrlsUrl,
  buildSharedMomentConfirmUrl,
  buildSharedMomentUploadUrl,
  buildSharedMultipartAbortUrl,
  buildSharedMultipartCompleteUrl,
  buildSharedMultipartStartUrl,
  buildTrackViewUrl,
} from "../../src/lib/apiUrls";

describe("apiUrls", () => {
  it("builds a base API URL with query params", () => {
    expect(
      buildApiUrl("https://api.example.com", "/api/events/phrases", {
        type: "boda",
        count: 15,
        skip: "",
      }),
    ).toBe("https://api.example.com/api/events/phrases?type=boda&count=15");
  });

  it("encodes event identifiers in path segments", () => {
    expect(
      buildEventApiUrl("https://api.example.com/", "mi evento", "moments", {
        page: 1,
        limit: 20,
      }),
    ).toBe(
      "https://api.example.com/api/events/mi%20evento/moments?page=1&limit=20",
    );
  });

  it("preserves configured backend subpaths before the API prefix", () => {
    expect(
      buildEventMomentsUrl(
        "https://staging.example.com/eventi-api/api",
        "mi evento",
      ),
    ).toBe(
      "https://staging.example.com/eventi-api/api/events/mi%20evento/moments",
    );
    expect(
      buildInvitationByTokenUrl(
        "https://staging.example.com/eventi-api",
        "ABC/123",
      ),
    ).toBe(
      "https://staging.example.com/eventi-api/api/invitations/ByToken?token=ABC%2F123",
    );
  });

  it("normalizes leading and trailing slashes from event route suffixes", () => {
    expect(
      buildEventApiUrl("https://api.example.com/", "mi evento", "/moments/"),
    ).toBe("https://api.example.com/api/events/mi%20evento/moments");
  });

  it("does not double-encode route identifiers already encoded by the browser", () => {
    expect(
      buildEventApiUrl("https://api.example.com/", " mi%20evento ", "moments"),
    ).toBe("https://api.example.com/api/events/mi%20evento/moments");
  });

  it("encodes invitation tokens in query params", () => {
    expect(
      buildInvitationByTokenUrl("https://api.example.com", "ABC/123"),
    ).toBe("https://api.example.com/api/invitations/ByToken?token=ABC%2F123");
  });

  it("builds RSVP URLs from normalized base URLs", () => {
    expect(buildRsvpUrl("https://api.example.com///")).toBe(
      "https://api.example.com/api/invitations/rsvp",
    );
    expect(buildRsvpUrl("https://api.example.com/api")).toBe(
      "https://api.example.com/api/invitations/rsvp",
    );
  });

  it("builds event meta URLs with preview tokens", () => {
    expect(
      buildEventMetaUrl("https://api.example.com", "mi evento", " token-123 "),
    ).toBe(
      "https://api.example.com/api/events/mi%20evento/meta?preview_token=token-123",
    );

    expect(
      buildEventMetaUrl(
        "https://api.example.com",
        "mi evento",
        " token-123 ",
        " 42 ",
        " invite/123 ",
      ),
    ).toBe(
      "https://api.example.com/api/events/mi%20evento/meta?preview_token=token-123&t=42&token=invite%2F123",
    );
  });

  it("builds public view tracking URLs with optional invitation tokens", () => {
    expect(buildTrackViewUrl("https://api.example.com", "mi evento")).toBe(
      "https://api.example.com/api/events/mi%20evento/view",
    );
    expect(
      buildTrackViewUrl("https://api.example.com/", "mi-evento", " ABC123 "),
    ).toBe("https://api.example.com/api/events/mi-evento/view?token=ABC123");
  });

  it("does not send dashboard preview cache keys to meta without signed preview tokens", () => {
    expect(
      buildEventMetaUrl(
        "https://api.example.com",
        "mi evento",
        "",
        " 42 ",
        " invite/123 ",
      ),
    ).toBe(
      "https://api.example.com/api/events/mi%20evento/meta?token=invite%2F123",
    );
  });

  it("builds public event action URLs", () => {
    expect(
      buildEventVerifyAccessUrl("https://api.example.com", "mi evento"),
    ).toBe("https://api.example.com/api/events/mi%20evento/verify-access");
    expect(
      buildEventVerifyAccessUrl(
        "https://api.example.com",
        "mi evento",
        " invite/123 ",
        " preview/123 ",
      ),
    ).toBe(
      "https://api.example.com/api/events/mi%20evento/verify-access?token=invite%2F123&preview_token=preview%2F123",
    );
    expect(
      buildEventMomentsUrl("https://api.example.com", "mi evento", {
        page: 1,
        limit: 20,
        preview_token: "token",
        t: "42",
        token: "invite/123",
      }),
    ).toBe(
      "https://api.example.com/api/events/mi%20evento/moments?page=1&limit=20&preview_token=token&t=42&token=invite%2F123",
    );
    expect(
      buildEventMomentsUrl("https://api.example.com", "mi evento", {
        cursor: "",
        limit: 100,
      }),
    ).toBe(
      "https://api.example.com/api/events/mi%20evento/moments?cursor=&limit=100",
    );
    expect(buildEventPhrasesUrl("https://api.example.com", "BODA", 15)).toBe(
      "https://api.example.com/api/events/phrases?type=BODA&count=15",
    );
  });

  it("builds personal and shared moment upload URLs", () => {
    const publicAccessQuery = {
      t: "42",
      preview_token: "preview/123",
      token: "invite/123",
    };

    expect(
      buildPersonalMomentCreateUrl("https://api.example.com", "event/1"),
    ).toBe("https://api.example.com/api/events/event%2F1/moments");
    expect(
      buildPersonalMomentUploadUrl("https://api.example.com", "event/1"),
    ).toBe("https://api.example.com/api/events/event%2F1/moments/upload-url");
    expect(
      buildPersonalMomentConfirmUrl("https://api.example.com", "event/1"),
    ).toBe("https://api.example.com/api/events/event%2F1/moments/confirm");
    expect(
      buildSharedMomentCreateUrl("https://api.example.com", "event/1"),
    ).toBe("https://api.example.com/api/events/event%2F1/moments/shared");
    expect(
      buildSharedMomentCreateUrl("https://api.example.com", "event/1", {
        ...publicAccessQuery,
      }),
    ).toBe(
      "https://api.example.com/api/events/event%2F1/moments/shared?t=42&preview_token=preview%2F123&token=invite%2F123",
    );
    expect(
      buildSharedMomentUploadUrl("https://api.example.com", "event/1"),
    ).toBe(
      "https://api.example.com/api/events/event%2F1/moments/shared/upload-url",
    );
    expect(
      buildSharedMomentBatchUploadUrlsUrl("https://api.example.com", "event/1"),
    ).toBe(
      "https://api.example.com/api/events/event%2F1/moments/shared/batch-upload-urls",
    );
    expect(
      buildSharedMomentConfirmUrl("https://api.example.com", "event/1"),
    ).toBe(
      "https://api.example.com/api/events/event%2F1/moments/shared/confirm",
    );
    expect(
      buildSharedMomentUploadUrl("https://api.example.com", "event/1", {
        ...publicAccessQuery,
      }),
    ).toBe(
      "https://api.example.com/api/events/event%2F1/moments/shared/upload-url?t=42&preview_token=preview%2F123&token=invite%2F123",
    );
    expect(
      buildSharedMomentBatchUploadUrlsUrl(
        "https://api.example.com",
        "event/1",
        {
          ...publicAccessQuery,
        },
      ),
    ).toBe(
      "https://api.example.com/api/events/event%2F1/moments/shared/batch-upload-urls?t=42&preview_token=preview%2F123&token=invite%2F123",
    );
    expect(
      buildSharedMomentConfirmUrl("https://api.example.com", "event/1", {
        ...publicAccessQuery,
      }),
    ).toBe(
      "https://api.example.com/api/events/event%2F1/moments/shared/confirm?t=42&preview_token=preview%2F123&token=invite%2F123",
    );
  });

  it("builds shared multipart upload URLs", () => {
    const publicAccessQuery = {
      t: "42",
      preview_token: "preview/123",
      token: "invite/123",
    };

    expect(
      buildSharedMultipartStartUrl("https://api.example.com", "event/1"),
    ).toBe(
      "https://api.example.com/api/events/event%2F1/moments/shared/multipart/start",
    );
    expect(
      buildSharedMultipartAbortUrl("https://api.example.com", "event/1"),
    ).toBe(
      "https://api.example.com/api/events/event%2F1/moments/shared/multipart/abort",
    );
    expect(
      buildSharedMultipartCompleteUrl("https://api.example.com", "event/1"),
    ).toBe(
      "https://api.example.com/api/events/event%2F1/moments/shared/multipart/complete",
    );
    expect(
      buildSharedMultipartCompleteUrl("https://api.example.com", "event/1", {
        ...publicAccessQuery,
      }),
    ).toBe(
      "https://api.example.com/api/events/event%2F1/moments/shared/multipart/complete?t=42&preview_token=preview%2F123&token=invite%2F123",
    );
    expect(
      buildSharedMultipartStartUrl("https://api.example.com", "event/1", {
        ...publicAccessQuery,
      }),
    ).toBe(
      "https://api.example.com/api/events/event%2F1/moments/shared/multipart/start?t=42&preview_token=preview%2F123&token=invite%2F123",
    );
    expect(
      buildSharedMultipartAbortUrl("https://api.example.com", "event/1", {
        ...publicAccessQuery,
      }),
    ).toBe(
      "https://api.example.com/api/events/event%2F1/moments/shared/multipart/abort?t=42&preview_token=preview%2F123&token=invite%2F123",
    );
  });

  it("builds section resource and attendee URLs", () => {
    expect(
      buildResourceUrl("https://api.example.com", "resource/1", {
        t: "42",
        preview_token: "preview/123",
        token: "invite/123",
      }),
    ).toBe(
      "https://api.example.com/api/resources/resource%2F1?t=42&preview_token=preview%2F123&token=invite%2F123",
    );

    expect(
      buildSectionResourcesUrl("https://api.example.com", "section/1"),
    ).toBe("https://api.example.com/api/resources/section/section%2F1");
    expect(
      buildSectionResourcesUrl("https://api.example.com", "section/1", {
        t: "42",
        preview_token: "preview/123",
        token: "invite/123",
      }),
    ).toBe(
      "https://api.example.com/api/resources/section/section%2F1?t=42&preview_token=preview%2F123&token=invite%2F123",
    );

    expect(
      buildSectionAttendeesUrl("https://api.example.com", "section/1"),
    ).toBe("https://api.example.com/api/events/section/section%2F1/attendees");
    expect(
      buildSectionAttendeesUrl("https://api.example.com", "section/1", {
        t: "42",
        preview_token: "preview/123",
        token: "invite/123",
      }),
    ).toBe(
      "https://api.example.com/api/events/section/section%2F1/attendees?t=42&preview_token=preview%2F123&token=invite%2F123",
    );
  });

  it("does not double-encode encoded section ids", () => {
    expect(buildResourceUrl("https://api.example.com", " resource%2F1 ")).toBe(
      "https://api.example.com/api/resources/resource%2F1",
    );
    expect(
      buildSectionResourcesUrl("https://api.example.com", " section%2F1 "),
    ).toBe("https://api.example.com/api/resources/section/section%2F1");
    expect(
      buildSectionAttendeesUrl("https://api.example.com", " section%2F1 "),
    ).toBe("https://api.example.com/api/events/section/section%2F1/attendees");
  });
});
