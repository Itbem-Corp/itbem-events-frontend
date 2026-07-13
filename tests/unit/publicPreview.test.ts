import { describe, expect, it } from "vitest";
import {
  parsePublicPreviewParams,
  publicAccessFetchInit,
  publicAccessLinkQueryParams,
  publicAccessQueryParams,
  readPublicAccessParams,
  resolvePublicAccessParams,
  shouldBypassPublicAccessHttpCache,
} from "../../src/lib/publicPreview";

describe("publicPreview", () => {
  it("detects dashboard preview mode and trims the signed token", () => {
    expect(
      parsePublicPreviewParams(
        "?preview=1&t=7&preview_token=%20preview-token%20",
      ),
    ).toEqual({
      isPreview: true,
      previewToken: "preview-token",
      cacheKey: "7",
    });
  });

  it("accepts a signed preview token even when preview=1 is omitted", () => {
    expect(parsePublicPreviewParams("?preview_token=token&t=7")).toEqual({
      isPreview: true,
      previewToken: "token",
      cacheKey: "7",
    });
  });

  it("accepts preview token aliases from incoming links", () => {
    expect(parsePublicPreviewParams("?previewToken=camel-preview&t=7")).toEqual(
      {
        isPreview: true,
        previewToken: "camel-preview",
        cacheKey: "7",
      },
    );
    expect(
      readPublicAccessParams("?PreviewToken=pascal-preview&token=invite"),
    ).toMatchObject({
      isPreview: true,
      previewToken: "pascal-preview",
      invitationToken: "invite",
    });
  });

  it("treats preview=1 without a signed token as normal public traffic", () => {
    expect(parsePublicPreviewParams("?preview=1&t=7")).toEqual({
      isPreview: false,
      previewToken: "",
      cacheKey: "",
    });
  });

  it("returns an empty token when it is not present", () => {
    expect(parsePublicPreviewParams("?token=abc")).toEqual({
      isPreview: false,
      previewToken: "",
      cacheKey: "",
    });
  });

  it("reads preview and invitation access params from one query string", () => {
    expect(
      readPublicAccessParams(
        "?preview=1&t=7&preview_token=preview-123&token=%20invite%2F123%20",
      ),
    ).toEqual({
      isPreview: true,
      previewToken: "preview-123",
      cacheKey: "7",
      invitationToken: "invite/123",
    });
  });

  it("reads public access params from full or relative URLs", () => {
    expect(
      readPublicAccessParams(
        "https://www.eventiapp.com.mx/e/mi-evento?preview_token=preview-123&t=9&token=invite%2F123&event_access_token=proof-123",
      ),
    ).toEqual({
      isPreview: true,
      previewToken: "preview-123",
      cacheKey: "9",
      invitationToken: "invite/123",
      accessToken: "proof-123",
    });

    expect(
      readPublicAccessParams(
        "/events/mi-evento/upload?previewToken=camel-preview&Token=invite-456",
      ),
    ).toMatchObject({
      isPreview: true,
      previewToken: "camel-preview",
      invitationToken: "invite-456",
    });
  });

  it("uses preview token params whenever a signed preview token is present", () => {
    expect(
      readPublicAccessParams("?preview_token=preview-123&token=invite"),
    ).toEqual({
      isPreview: true,
      previewToken: "preview-123",
      cacheKey: "",
      invitationToken: "invite",
    });
  });

  it("reads backend event access proof query aliases", () => {
    expect(
      readPublicAccessParams(
        "?event_access_token=%20proof-token%20&token=invite",
      ),
    ).toEqual({
      isPreview: false,
      previewToken: "",
      cacheKey: "",
      invitationToken: "invite",
      accessToken: "proof-token",
    });

    expect(
      readPublicAccessParams("?eventAccessToken=camel-proof"),
    ).toMatchObject({ accessToken: "camel-proof" });
    expect(
      readPublicAccessParams("?EventAccessToken=pascal-proof"),
    ).toMatchObject({ accessToken: "pascal-proof" });
  });

  it("merges section-level access proof with URL preview and invitation params", () => {
    expect(
      resolvePublicAccessParams(
        { accessToken: " proof-token " },
        "?preview_token=preview-123&t=7&token=invite-123",
      ),
    ).toEqual({
      isPreview: true,
      previewToken: "preview-123",
      cacheKey: "7",
      invitationToken: "invite-123",
      accessToken: "proof-token",
    });
  });

  it("uses URL-scoped event access proof when no explicit proof is provided", () => {
    expect(
      resolvePublicAccessParams(
        undefined,
        "?preview_token=preview-123&t=7&event_access_token=query-proof",
      ),
    ).toEqual({
      isPreview: true,
      previewToken: "preview-123",
      cacheKey: "7",
      invitationToken: "",
      accessToken: "query-proof",
    });
  });

  it("ignores blank section access overrides and keeps URL-scoped params", () => {
    expect(
      resolvePublicAccessParams(
        {
          previewToken: "",
          invitationToken: " ",
          accessToken: " ",
        },
        "?preview_token=preview-123&t=7&token=query-invite&event_access_token=query-proof",
      ),
    ).toEqual({
      isPreview: true,
      previewToken: "preview-123",
      cacheKey: "7",
      invitationToken: "query-invite",
      accessToken: "query-proof",
    });
  });

  it("lets non-empty section access overrides replace URL-scoped params", () => {
    expect(
      resolvePublicAccessParams(
        {
          previewToken: " prop-preview ",
          invitationToken: "prop-invite",
          accessToken: "proof-token",
        },
        "?preview_token=preview-123&t=7&token=query-invite",
      ),
    ).toEqual({
      isPreview: true,
      previewToken: "prop-preview",
      cacheKey: "7",
      invitationToken: "prop-invite",
      accessToken: "proof-token",
    });
  });

  it("marks prop-scoped preview tokens as preview mode", () => {
    expect(
      resolvePublicAccessParams(
        {
          previewToken: " prop-preview ",
          cacheKey: " 9 ",
        },
        "",
      ),
    ).toMatchObject({
      isPreview: true,
      previewToken: "prop-preview",
      cacheKey: "9",
    });
  });

  it("lets section-level preview cache keys refresh scoped resource requests", () => {
    const params = resolvePublicAccessParams(
      {
        previewToken: "preview-123",
        cacheKey: 8,
        invitationToken: "invite-123",
      },
      "?preview_token=preview-123&t=7&token=query-invite",
    );

    expect(params).toMatchObject({
      isPreview: true,
      previewToken: "preview-123",
      cacheKey: "8",
      invitationToken: "invite-123",
    });
    expect(publicAccessQueryParams(params)).toEqual({
      t: "8",
      preview_token: "preview-123",
      token: "invite-123",
    });
  });

  it("builds API query params for public access endpoints", () => {
    expect(
      publicAccessQueryParams({
        cacheKey: " 7 ",
        previewToken: " preview-123 ",
        invitationToken: " invite/123 ",
      }),
    ).toEqual({
      t: "7",
      preview_token: "preview-123",
      token: "invite/123",
    });
  });

  it("builds navigable public access link params with the canonical frontend keys", () => {
    expect(
      publicAccessLinkQueryParams({
        cacheKey: " 7 ",
        previewToken: " preview/123 ",
        invitationToken: " invite/123 ",
        accessToken: " proof/123 ",
      }),
    ).toEqual({
      preview: "1",
      t: "7",
      preview_token: "preview/123",
      token: "invite/123",
      event_access_token: "proof/123",
    });
  });

  it("does not add cache-only values to navigable public access links", () => {
    expect(
      publicAccessLinkQueryParams({
        cacheKey: "7",
        previewToken: "",
      }),
    ).toEqual({
      preview: undefined,
      t: undefined,
      preview_token: undefined,
      token: undefined,
      event_access_token: undefined,
    });
  });

  it("omits empty API query params", () => {
    expect(
      publicAccessQueryParams({
        cacheKey: "",
        previewToken: "",
        invitationToken: "",
      }),
    ).toEqual({
      t: undefined,
      preview_token: undefined,
      token: undefined,
    });
  });

  it("does not send dashboard preview cache keys without signed preview tokens", () => {
    expect(
      publicAccessQueryParams({
        cacheKey: "7",
        previewToken: "",
        invitationToken: "invite/123",
      }),
    ).toEqual({
      t: undefined,
      preview_token: undefined,
      token: "invite/123",
    });
  });

  it("sends public content-version cache keys when explicitly marked safe", () => {
    expect(
      publicAccessQueryParams({
        cacheKey: "2026-07-09T12:00:00.000Z",
        sendCacheKey: true,
        previewToken: "",
        invitationToken: "",
      }),
    ).toEqual({
      t: "2026-07-09T12:00:00.000Z",
      preview_token: undefined,
      token: undefined,
    });
  });

  it("bypasses HTTP cache for preview or invitation-scoped requests", () => {
    expect(
      shouldBypassPublicAccessHttpCache({
        previewToken: " preview ",
      }),
    ).toBe(true);
    expect(
      shouldBypassPublicAccessHttpCache({
        invitationToken: " invite/123 ",
      }),
    ).toBe(true);
    expect(
      shouldBypassPublicAccessHttpCache({
        previewToken: "",
        invitationToken: " ",
      }),
    ).toBe(false);
    expect(
      shouldBypassPublicAccessHttpCache({
        cacheKey: "2026-07-09T12:00:00.000Z",
        sendCacheKey: true,
      }),
    ).toBe(true);
    expect(
      shouldBypassPublicAccessHttpCache({
        accessToken: " proof-token ",
      }),
    ).toBe(true);
  });

  it("adds no-store while preserving existing fetch init options", () => {
    const controller = new AbortController();

    expect(
      publicAccessFetchInit(
        { invitationToken: "invite/123" },
        { signal: controller.signal },
      ),
    ).toEqual({
      signal: controller.signal,
      cache: "no-store",
    });
    expect(publicAccessFetchInit({ invitationToken: "" })).toBeUndefined();
  });

  it("adds the event access proof header and bypasses HTTP cache", () => {
    const init = publicAccessFetchInit(
      { accessToken: " proof-token " },
      { headers: { "Content-Type": "application/json" } },
    );

    expect(init?.cache).toBe("no-store");
    const headers = new Headers(init?.headers);
    expect(headers.get("Content-Type")).toBe("application/json");
    expect(headers.get("X-Event-Access-Token")).toBe("proof-token");
  });

  it("turns a URL-scoped proof into the backend access header", () => {
    const init = publicAccessFetchInit(
      readPublicAccessParams("?event_access_token=proof-token"),
    );

    const headers = new Headers(init?.headers);
    expect(init?.cache).toBe("no-store");
    expect(headers.get("X-Event-Access-Token")).toBe("proof-token");
  });
});
