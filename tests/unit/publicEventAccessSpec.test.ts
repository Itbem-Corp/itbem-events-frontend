import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchPublicEventAccessSpec } from "../../src/lib/publicEventAccessSpec";

const originalFetch = globalThis.fetch;

function mockPageSpecFetch() {
  const fetchMock = vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      data: {
        meta: { pageTitle: "Evento" },
        sections: [],
      },
    }),
  })) as unknown as typeof fetch;

  globalThis.fetch = fetchMock;
  return fetchMock as unknown as ReturnType<typeof vi.fn>;
}

describe("fetchPublicEventAccessSpec", () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("loads PageSpec with preview, invitation and event access proof scopes", async () => {
    const fetchMock = mockPageSpecFetch();

    await fetchPublicEventAccessSpec({
      eventsUrl: "https://api.example.com",
      identifier: "mi evento",
      previewToken: " preview/123 ",
      previewCacheKey: " 42 ",
      sendCacheKey: true,
      invitationToken: " invite/123 ",
      accessToken: " proof/123 ",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [input, init] = fetchMock.mock.calls[0] as [
      RequestInfo | URL,
      RequestInit | undefined,
    ];

    expect(String(input)).toBe(
      "https://api.example.com/api/events/mi%20evento/page-spec?preview_token=preview%2F123&t=42&token=invite%2F123",
    );
    expect(init?.cache).toBe("no-store");
    const headers = new Headers(init?.headers);
    expect(headers.get("X-Event-Access-Token")).toBe("proof/123");
  });

  it("omits the event access proof header when the proof is blank", async () => {
    const fetchMock = mockPageSpecFetch();

    await fetchPublicEventAccessSpec({
      eventsUrl: "https://api.example.com",
      identifier: "mi-evento",
      previewToken: "preview-token",
      accessToken: " ",
    });

    const [, init] = fetchMock.mock.calls[0] as [
      RequestInfo | URL,
      RequestInit | undefined,
    ];

    expect(init?.cache).toBe("no-store");
    const headers = new Headers(init?.headers);
    expect(headers.has("X-Event-Access-Token")).toBe(false);
  });
});
