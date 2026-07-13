import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchApiResultWithRetry } from "../../src/lib/apiRetry";

describe("fetchApiResultWithRetry", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("retries network failures before returning a successful response", async () => {
    const payload = {
      status: 200,
      message: "ok",
      data: { meta: { pageTitle: "Evento" }, sections: [] },
    };
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(new Response(JSON.stringify(payload), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      fetchApiResultWithRetry("/api/events/page-spec", {
        retries: 2,
        retryDelayMs: () => 0,
      }),
    ).resolves.toMatchObject({
      ok: true,
      status: 200,
      data: payload.data,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not retry access decisions", async () => {
    const payload = {
      status: 403,
      message: "Event is not public",
      error: "forbidden",
    };
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(payload), { status: 403 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      fetchApiResultWithRetry("/api/events/private/page-spec", {
        retries: 3,
        retryDelayMs: () => 0,
      }),
    ).resolves.toMatchObject({
      ok: false,
      status: 403,
      message: "Event is not public",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not retry expired or invalid invitation tokens", async () => {
    const payload = {
      status: 401,
      message: "Invalid invitation token",
      error: "unauthorized",
    };
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(payload), { status: 401 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      fetchApiResultWithRetry("/api/events/page-spec?token=expired", {
        retries: 3,
        retryDelayMs: () => 0,
      }),
    ).resolves.toMatchObject({
      ok: false,
      status: 401,
      message: "Invalid invitation token",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
