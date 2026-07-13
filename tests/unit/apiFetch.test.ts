import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ApiFetchError,
  fetchApiData,
  fetchApiResult,
  isApiFetchError,
} from "../../src/lib/apiFetch";

describe("fetchApiData", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("unwraps successful backend APIResponse payloads", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          status: 200,
          message: "ok",
          data: [{ id: "resource-1" }],
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchApiData("/api/resources")).resolves.toEqual([
      { id: "resource-1" },
    ]);
    expect(fetchMock).toHaveBeenCalledWith("/api/resources", undefined);
  });

  it("unwraps Pascal-cased successful APIResponse payloads", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            Status: 200,
            Message: "ok",
            Data: [{ id: "resource-1" }],
          }),
          { status: 200 },
        ),
      ),
    );

    await expect(fetchApiData("/api/resources")).resolves.toEqual([
      { id: "resource-1" },
    ]);
  });

  it("keeps direct payloads unchanged", async () => {
    const payload = { items: [{ id: "moment-1" }], has_more: false };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify(payload), { status: 200 }),
      ),
    );

    await expect(fetchApiData("/api/events/demo/moments")).resolves.toEqual(
      payload,
    );
  });

  it("surfaces backend error messages", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            status: 403,
            message: "Uploads disabled",
            error: "forbidden",
          }),
          { status: 403 },
        ),
      ),
    );

    await expect(fetchApiData("/api/events/demo/moments")).rejects.toThrow(
      "Uploads disabled",
    );
  });

  it("surfaces Pascal-cased backend error messages", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            Status: 403,
            Message: "Uploads disabled",
            Error: "forbidden",
          }),
          { status: 403 },
        ),
      ),
    );

    await expect(fetchApiData("/api/events/demo/moments")).rejects.toThrow(
      "Uploads disabled",
    );
  });

  it("preserves response status and payload on backend errors", async () => {
    const payload = {
      status: 429,
      message: "Ya registramos tus contribuciones",
      uploads_remaining: 0,
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify(payload), { status: 429 }),
      ),
    );

    try {
      await fetchApiData("/api/events/demo/moments/shared/upload-url");
      throw new Error("expected fetchApiData to throw");
    } catch (error) {
      expect(isApiFetchError(error)).toBe(true);
      expect(error).toBeInstanceOf(ApiFetchError);
      if (!isApiFetchError(error)) return;
      expect(error.status).toBe(429);
      expect(error.payload).toEqual(payload);
      expect(error.message).toBe("Ya registramos tus contribuciones");
    }
  });
});

describe("fetchApiResult", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns status, payload, and unwrapped data without throwing", async () => {
    const payload = {
      status: 200,
      message: "ok",
      data: { meta: { pageTitle: "Evento" }, sections: [] },
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify(payload), { status: 200 }),
      ),
    );

    await expect(fetchApiResult("/api/events/page-spec")).resolves.toEqual({
      ok: true,
      status: 200,
      payload,
      data: payload.data,
      message: "",
    });
  });

  it("returns backend error details without throwing", async () => {
    const payload = {
      status: 403,
      message: "Event is not public",
      error: "forbidden",
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify(payload), { status: 403 }),
      ),
    );

    await expect(
      fetchApiResult("/api/events/private/page-spec", undefined, "Fallback"),
    ).resolves.toEqual({
      ok: false,
      status: 403,
      payload,
      data: null,
      message: "Event is not public",
    });
  });
});
