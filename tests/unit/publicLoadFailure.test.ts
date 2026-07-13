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
