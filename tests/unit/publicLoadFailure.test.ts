import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { PublicEventLoadError } from "../../src/components/common/PublicEventLoadError";
import { resolvePublicLoadFailure } from "../../src/lib/publicLoadFailure";

describe("resolvePublicLoadFailure", () => {
  it("localizes a permanent moments 403 and disables retry", () => {
    const failure = resolvePublicLoadFailure({
      status: 403,
      resource: "moments",
      backendMessage: "Event is not public",
    });

    expect(failure).toMatchObject({
      status: 403,
      retryable: false,
      title: "Este muro aún no está disponible",
    });
    expect(failure.message).not.toContain("Event is not public");
  });

  it("keeps a useful backend message and retry for temporary failures", () => {
    const failure = resolvePublicLoadFailure({
      status: 500,
      resource: "event",
      backendMessage: "Error cargando el evento",
    });

    expect(failure.retryable).toBe(true);
    expect(failure.message).toBe("Error cargando el evento");
  });

  it("keeps event copy grammatically aligned with the resource", () => {
    const failure = resolvePublicLoadFailure({
      status: 403,
      resource: "event",
    });

    expect(failure.message).toBe(
      "El organizador todavía no lo ha publicado para invitados.",
    );
  });

  it("replaces browser-level network errors with useful Spanish copy", () => {
    const failure = resolvePublicLoadFailure({
      resource: "invitation",
      backendMessage: "Failed to fetch",
    });

    expect(failure.retryable).toBe(true);
    expect(failure.message).toContain("La conexión no respondió");
  });
});

describe("PublicEventLoadError", () => {
  it("renders a semantic moments state without a useless retry", () => {
    const failure = resolvePublicLoadFailure({
      status: 403,
      resource: "moments",
    });
    const markup = renderToStaticMarkup(
      createElement(PublicEventLoadError, {
        kind: "moments",
        title: failure.title,
        message: failure.message,
        supportText: failure.supportText,
      }),
    );

    expect(markup).toContain('role="alert"');
    expect(markup).toContain("Muro de momentos");
    expect(markup).toContain("Este muro aún no está disponible");
    expect(markup).not.toContain("Reintentar");
  });

  it("offers an accessible retry for transient failures", () => {
    const failure = resolvePublicLoadFailure({
      status: 500,
      resource: "moments",
    });
    const markup = renderToStaticMarkup(
      createElement(PublicEventLoadError, {
        kind: "moments",
        title: failure.title,
        message: failure.message,
        supportText: failure.supportText,
        onRetry: vi.fn(),
      }),
    );

    expect(markup).toContain("Reintentar");
    expect(markup).toContain("focus-visible:ring-2");
  });
});

describe("resolvePublicLoadFailure: invalid links and deleted events", () => {
  it.each([
    [401, "invitation_token_expired"],
    [401, "invitation_token_invalid"],
  ])("explains an expired or invalid link (%s %s) on /e/ and /rsvp/", (status, code) => {
    for (const resource of ["event", "invitation"] as const) {
      const failure = resolvePublicLoadFailure({ status, code, resource });
      expect(failure).toMatchObject({
        retryable: false,
        title: "Este enlace ya no es válido o expiró",
      });
      expect(failure.message).not.toMatch(/publicado/);
    }
  });

  it("maps the token route's bare 401 'token expired' to the invalid link copy", () => {
    const failure = resolvePublicLoadFailure({
      status: 401,
      resource: "invitation",
      backendMessage: "token expired",
    });
    expect(failure.title).toBe("Este enlace ya no es válido o expiró");
  });

  it("keeps the 'requires access' copy for a password 401", () => {
    const failure = resolvePublicLoadFailure({
      status: 401,
      code: "event_password_required",
      resource: "event",
    });
    expect(failure.title).toBe("Este evento requiere acceso");
  });

  it("keeps 'not published yet' for a real 403 without a token code", () => {
    const failure = resolvePublicLoadFailure({ status: 403, resource: "event" });
    expect(failure.title).toBe("Este evento aún no está disponible");
  });

  it("says a deleted event is no longer available (410 event_gone)", () => {
    for (const failure of [
      resolvePublicLoadFailure({ status: 410, resource: "event" }),
      resolvePublicLoadFailure({ status: 404, code: "event_gone", resource: "invitation" }),
    ]) {
      expect(failure.title).toBe("Este evento ya no está disponible");
      expect(failure.retryable).toBe(false);
    }
  });
});
