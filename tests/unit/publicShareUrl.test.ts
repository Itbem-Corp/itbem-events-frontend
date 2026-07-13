import { describe, expect, it } from "vitest";
import {
  buildPublicShareUrl,
  sanitizePublicShareUrl,
} from "../../src/lib/publicShareUrl";

describe("publicShareUrl", () => {
  it("strips dashboard preview params and invitation tokens from shared links", () => {
    expect(
      sanitizePublicShareUrl(
        "https://public.test/e/mi-evento?preview=1&t=42&preview_token=preview-123&token=invite%2F123",
      ),
    ).toBe("https://public.test/e/mi-evento");
  });

  it("strips preview and personal token aliases from shared links", () => {
    expect(
      sanitizePublicShareUrl(
        "https://public.test/events/mi-evento/upload?previewToken=preview-123&t=42&pretty_token=abc",
      ),
    ).toBe("https://public.test/events/mi-evento/upload");
  });

  it("strips all backend-supported invitation token aliases", () => {
    expect(
      sanitizePublicShareUrl(
        "https://public.test/e/mi-evento?Token=raw&prettyToken=pretty&PrettyToken=pretty-pascal&invitation_token=invite&invitationToken=invite-camel&InvitationToken=invite-pascal",
      ),
    ).toBe("https://public.test/e/mi-evento");
  });

  it("strips event access proof token aliases", () => {
    expect(
      sanitizePublicShareUrl(
        "https://public.test/e/mi-evento?event_access_token=proof-123&eventAccessToken=proof-456&access_token=oauth-style&accessToken=camel-style&AccessToken=pascal-style",
      ),
    ).toBe("https://public.test/e/mi-evento");
  });

  it("preserves ordinary cache keys when the link is not a dashboard preview", () => {
    expect(
      sanitizePublicShareUrl("https://public.test/e/mi-evento?t=ordinary"),
    ).toBe("https://public.test/e/mi-evento?t=ordinary");
  });

  it("returns invalid urls unchanged", () => {
    expect(sanitizePublicShareUrl("not a url")).toBe("not a url");
  });

  it.each([
    "/e/mi-evento",
    "/e/mi-evento/momentos",
    "/e/mi-evento/tv",
    "/rsvp/mi-evento",
    "/events/mi-evento/upload",
    "/events/upload",
    "/evento",
  ])("sanitizes every SSR route used as an Open Graph URL: %s", (path) => {
    const result = new URL(
      sanitizePublicShareUrl(
        `https://www.eventiapp.com.mx${path}?preview=1&t=cache&preview_token=preview&token=invite&event_access_token=access&access_token=generic-access&utm_source=share`,
      ),
    );

    expect(result.pathname).toBe(path);
    expect(result.searchParams.get("utm_source")).toBe("share");
    expect(result.searchParams.has("preview")).toBe(false);
    expect(result.searchParams.has("t")).toBe(false);
    expect(result.searchParams.has("preview_token")).toBe(false);
    expect(result.searchParams.has("token")).toBe(false);
    expect(result.searchParams.has("event_access_token")).toBe(false);
    expect(result.searchParams.has("access_token")).toBe(false);
  });

  it("turns token-only invitation routes into a usable canonical event URL", () => {
    expect(
      buildPublicShareUrl(
        "https://public.test/evento?token=private-token&preview=true#details",
        "boda-ana-luis",
      ),
    ).toBe("https://public.test/e/boda-ana-luis");
  });

  it("falls back to token sanitization when no identifier is available", () => {
    expect(
      buildPublicShareUrl(
        "https://public.test/e/mi-evento?token=private-token",
      ),
    ).toBe("https://public.test/e/mi-evento");
  });
});
