import { describe, expect, it } from "vitest";
import { resolveInvitationLoaderPublicAccess } from "../../src/components/InvitationDataLoader";
import { publicAccessFetchInit } from "../../src/lib/publicPreview";

describe("resolveInvitationLoaderPublicAccess", () => {
  it("falls back to the route token when no scoped invitation token exists", () => {
    expect(resolveInvitationLoaderPublicAccess(" route/token ")).toMatchObject({
      isPreview: false,
      previewToken: "",
      cacheKey: "",
      invitationToken: "route/token",
      accessToken: "",
    });
  });

  it("keeps URL-scoped access when explicit overrides are blank", () => {
    const access = resolveInvitationLoaderPublicAccess(
      "route-token",
      {
        invitationToken: " ",
        accessToken: "",
      },
      "?token=query%2Finvite&event_access_token=%20proof%2F123%20",
    );

    expect(access).toMatchObject({
      invitationToken: "query/invite",
      accessToken: "proof/123",
    });

    const init = publicAccessFetchInit(access);
    expect(new Headers(init?.headers).get("X-Event-Access-Token")).toBe(
      "proof/123",
    );
  });

  it("lets explicit scoped tokens replace URL-scoped tokens", () => {
    expect(
      resolveInvitationLoaderPublicAccess(
        "route-token",
        {
          previewToken: " prop-preview ",
          cacheKey: " 8 ",
          invitationToken: " prop-invite ",
          accessToken: " prop-proof ",
        },
        "?preview_token=query-preview&t=7&token=query-invite&event_access_token=query-proof",
      ),
    ).toMatchObject({
      isPreview: true,
      previewToken: "prop-preview",
      cacheKey: "8",
      invitationToken: "prop-invite",
      accessToken: "prop-proof",
    });
  });
});
