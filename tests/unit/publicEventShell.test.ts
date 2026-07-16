import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchPublicEventShell } from "../../src/lib/publicEventShell";

describe("fetchPublicEventShell", () => {
  afterEach(() => vi.unstubAllGlobals());

  it.each([
    ["previewToken", "preview-secret"],
    ["cacheKey", "cache-secret"],
    ["invitationToken", "invitation-secret"],
    ["accessToken", "access-secret"],
  ] as const)("never server-renders a page carrying %s", async (key, value) => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const result = await fetchPublicEventShell({
      eventsUrl: "https://api.example.com",
      identifier: "private-event",
      [key]: value,
    });

    expect(result).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
