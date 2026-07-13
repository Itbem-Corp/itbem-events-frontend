import { describe, expect, it } from "vitest";

import { normalizeEventAccessVerification } from "../../src/lib/eventAccess";

describe("normalizeEventAccessVerification", () => {
  it("reads the canonical backend access proof response", () => {
    expect(
      normalizeEventAccessVerification({
        status: 200,
        data: {
          passwordProtected: true,
          accessToken: " proof-token ",
          accessTokenType: "event_password",
          accessVersion: "2026-07-08T10:00:00Z",
          expiresAt: "2026-07-08T10:15:00Z",
        },
      }),
    ).toEqual({
      passwordProtected: true,
      accessToken: "proof-token",
      accessTokenType: "event_password",
      accessVersion: "2026-07-08T10:00:00Z",
      expiresAt: "2026-07-08T10:15:00Z",
    });
  });

  it("accepts snake_case and PascalCase aliases from adapters", () => {
    expect(
      normalizeEventAccessVerification({
        Data: {
          PasswordProtected: "true",
          access_token: " snake-proof ",
          access_token_type: "event_password",
          access_version: "v1",
          expires_at: "2026-07-08T10:15:00Z",
        },
      }),
    ).toMatchObject({
      passwordProtected: true,
      accessToken: "snake-proof",
      accessTokenType: "event_password",
      accessVersion: "v1",
      expiresAt: "2026-07-08T10:15:00Z",
    });
  });

  it("falls back to later access aliases when canonical fields are null", () => {
    expect(
      normalizeEventAccessVerification({
        status: 200,
        data: {
          passwordProtected: null,
          PasswordProtected: true,
          accessToken: null,
          AccessToken: " proof-token ",
          accessTokenType: undefined,
          AccessTokenType: "event_password",
          accessVersion: null,
          AccessVersion: "v2",
          expiresAt: null,
          ExpiresAt: "2026-07-08T10:15:00Z",
        },
      }),
    ).toMatchObject({
      passwordProtected: true,
      accessToken: "proof-token",
      accessTokenType: "event_password",
      accessVersion: "v2",
      expiresAt: "2026-07-08T10:15:00Z",
    });
  });

  it("falls back to later access aliases when canonical envelope fields are blank", () => {
    expect(
      normalizeEventAccessVerification({
        status: 200,
        data: " ",
        Data: {
          passwordProtected: " ",
          PasswordProtected: true,
          accessToken: " ",
          AccessToken: " proof-token ",
          accessTokenType: " ",
          AccessTokenType: "event_password",
          accessVersion: " ",
          AccessVersion: "v3",
          expiresAt: " ",
          ExpiresAt: "2026-07-08T10:15:00Z",
        },
      }),
    ).toMatchObject({
      passwordProtected: true,
      accessToken: "proof-token",
      accessTokenType: "event_password",
      accessVersion: "v3",
      expiresAt: "2026-07-08T10:15:00Z",
    });
  });

  it("returns a closed empty shape for malformed payloads", () => {
    expect(normalizeEventAccessVerification(null)).toEqual({
      passwordProtected: false,
      accessToken: "",
      accessTokenType: "",
      accessVersion: "",
      expiresAt: "",
    });
  });
});
