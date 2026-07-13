import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildMomentsOgMeta,
  buildPublicEventOgMeta,
  buildRsvpOgMeta,
  buildSharedUploadOgMeta,
  buildTvOgMeta,
  fetchEventOgData,
  fetchInvitationOgData,
  readInvitationEventOgData,
  resolveOgCoverUrl,
} from "../../src/lib/og";

beforeEach(() => {
  // Metadata fallback tests must not inherit a developer or CI dashboard URL.
  // Individual branded-image cases opt in explicitly below.
  vi.stubEnv("PUBLIC_DASHBOARD_URL", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("resolveOgCoverUrl", () => {
  const base = "https://events.example.com/";

  it("turns raw backend storage keys into public media URLs", () => {
    expect(resolveOgCoverUrl("events/abc/cover.webp", base)).toBe(
      "https://events.example.com/storage/events/abc/cover.webp",
    );
  });

  it("keeps absolute cover URLs unchanged", () => {
    expect(
      resolveOgCoverUrl("https://cdn.example.com/events/abc/cover.webp", base),
    ).toBe("https://cdn.example.com/events/abc/cover.webp");
  });
});

describe("public event OG helpers", () => {
  it("builds public event metadata from backend event fields", () => {
    expect(
      buildPublicEventOgMeta(
        {
          name: "Boda Ana y Luis",
          description: "Celebremos juntos este gran dia",
          cover_image_url: "events/boda/cover.webp",
          view_url: "https://cdn.example.com/signed-cover.webp",
          event_date_time: "2026-08-15T20:30:00-06:00",
          address: "Hacienda Centro",
          event_type: "wedding",
        },
        "https://events.example.com",
      ),
    ).toEqual({
      title: "Boda Ana y Luis",
      description: "Celebremos juntos este gran dia",
      image: "https://cdn.example.com/signed-cover.webp",
    });
  });

  it("prefers cover_view_url over raw and legacy cover aliases", () => {
    expect(
      buildPublicEventOgMeta(
        {
          name: "Boda con portada",
          cover_image_url: "events/boda/cover.webp",
          view_url: "https://cdn.example.com/legacy-view.webp",
          cover_view_url: "https://cdn.example.com/cover-view.webp",
        },
        "https://events.example.com",
      ).image,
    ).toBe("https://cdn.example.com/cover-view.webp");
  });

  it("builds RSVP and moments metadata from the same event contract", () => {
    const event = {
      name: "Graduacion Izapa",
      organizer_name: "Instituto Izapa",
      cover_image_url: "events/grad/cover.webp",
      event_type: "graduation",
    };

    expect(buildRsvpOgMeta(event, "https://events.example.com")).toEqual({
      title: "Confirma | Graduacion Izapa",
      description:
        "Instituto Izapa te espera. Confirma tu asistencia en segundos.",
      image: "https://events.example.com/storage/events/grad/cover.webp",
    });
    expect(buildMomentsOgMeta(event, "https://events.example.com")).toEqual({
      title: "Momentos - Graduacion Izapa",
      description:
        "Galeria de fotos y videos de Graduacion Izapa. Revive los mejores momentos.",
      image: "https://events.example.com/storage/events/grad/cover.webp",
    });
  });

  it("passes the event timezone to the dashboard OG image endpoint", () => {
    vi.stubEnv("PUBLIC_DASHBOARD_URL", "https://dashboard.example.com");

    const meta = buildPublicEventOgMeta({
      name: "Boda con zona",
      event_date_time: "2026-08-16T04:30:00Z",
      timezone: "America/Mexico_City",
      language: "en",
      address: "Hacienda Centro",
      event_type: "wedding",
    });

    const url = new URL(meta.image);
    expect(url.origin).toBe("https://dashboard.example.com");
    expect(url.pathname).toBe("/api/og");
    expect(url.searchParams.get("date")).toBe("2026-08-16T04:30:00Z");
    expect(url.searchParams.get("timezone")).toBe("America/Mexico_City");
    expect(url.searchParams.get("language")).toBe("en");
    expect(url.searchParams.get("address")).toBe("Hacienda Centro");
  });

  it("uses the event secondary address as the dashboard OG address fallback", () => {
    vi.stubEnv("PUBLIC_DASHBOARD_URL", "https://dashboard.example.com");

    const meta = buildPublicEventOgMeta({
      name: "Recepcion secundaria",
      second_address: "Terraza Central",
      event_type: "wedding",
    });

    const url = new URL(meta.image);
    expect(url.origin).toBe("https://dashboard.example.com");
    expect(url.pathname).toBe("/api/og");
    expect(url.searchParams.get("address")).toBe("Terraza Central");
  });

  it("uses route-specific fallback metadata when event data is unavailable", () => {
    expect(buildPublicEventOgMeta(null)).toMatchObject({
      title: "Estas invitado",
      image: "",
    });
    expect(buildRsvpOgMeta(null)).toMatchObject({
      title: "Confirma tu asistencia",
      image: "",
    });
    expect(buildMomentsOgMeta(null)).toMatchObject({
      title: "Momentos del evento",
      image: "",
    });
  });
});

describe("buildSharedUploadOgMeta", () => {
  it("builds branded upload metadata from event data", () => {
    expect(
      buildSharedUploadOgMeta(
        {
          name: "Boda Ana y Luis",
          cover_image_url: "events/boda/cover.webp",
          event_type: "wedding",
        },
        "https://events.example.com",
      ),
    ).toEqual({
      title: "Sube tus fotos - Boda Ana y Luis",
      description:
        "Comparte tus mejores fotos y videos de Boda Ana y Luis. Solo toma un segundo.",
      image: "https://events.example.com/storage/events/boda/cover.webp",
    });
  });

  it("keeps event date, timezone, language, and place in dashboard upload OG images", () => {
    vi.stubEnv("PUBLIC_DASHBOARD_URL", "https://dashboard.example.com");

    const meta = buildSharedUploadOgMeta({
      name: "Upload con contexto",
      event_date_time: "2026-09-01T01:30:00Z",
      timezone: "America/Mexico_City",
      language: "en",
      second_address: "Salon del Lago",
      event_type: "graduation",
    });

    const url = new URL(meta.image);
    expect(url.origin).toBe("https://dashboard.example.com");
    expect(url.pathname).toBe("/api/og");
    expect(url.searchParams.get("date")).toBe("2026-09-01T01:30:00Z");
    expect(url.searchParams.get("timezone")).toBe("America/Mexico_City");
    expect(url.searchParams.get("language")).toBe("en");
    expect(url.searchParams.get("address")).toBe("Salon del Lago");
    expect(url.searchParams.get("type")).toBe("graduation");
  });

  it("uses neutral upload metadata when event data is unavailable", () => {
    expect(buildSharedUploadOgMeta(null)).toEqual({
      title: "Comparte tu momento",
      description:
        "Sube tus fotos y videos del evento. Tus recuerdos son parte de la historia.",
      image: "",
    });
  });
});

describe("buildTvOgMeta", () => {
  it("builds mode TV metadata with the shared dashboard OG contract", () => {
    vi.stubEnv("PUBLIC_DASHBOARD_URL", "https://dashboard.example.com");

    const meta = buildTvOgMeta({
      name: "Boda TV",
      event_date_time: "2026-11-02T03:00:00Z",
      timezone: "America/Mexico_City",
      language: "es",
      second_address: "Jardin Nocturno",
      event_type: "wedding",
    });

    expect(meta).toMatchObject({
      title: "Slideshow - Boda TV",
      description: "Disfruta los momentos de Boda TV en modo TV.",
    });

    const url = new URL(meta.image);
    expect(url.origin).toBe("https://dashboard.example.com");
    expect(url.pathname).toBe("/api/og");
    expect(url.searchParams.get("date")).toBe("2026-11-02T03:00:00Z");
    expect(url.searchParams.get("timezone")).toBe("America/Mexico_City");
    expect(url.searchParams.get("language")).toBe("es");
    expect(url.searchParams.get("address")).toBe("Jardin Nocturno");
    expect(url.searchParams.get("type")).toBe("wedding");
  });

  it("uses neutral TV metadata when event data is unavailable", () => {
    expect(buildTvOgMeta(null)).toEqual({
      title: "Slideshow del evento",
      description:
        "Modo TV para disfrutar los momentos del evento en pantalla completa.",
      image: "",
    });
  });
});

describe("fetchEventOgData", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reads backend APIResponse payloads from the meta endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        status: 200,
        message: "loaded",
        data: {
          identifier: "boda",
          name: "Boda",
          description: "Celebra con nosotros",
          cover_image_url: "events/boda/cover.webp",
          view_url: "https://cdn.example.com/signed-cover.webp",
          event_date_time: "2026-08-15T20:30:00Z",
          address: "Salon Central",
          organizer_name: "Ana y Luis",
          event_type: "wedding",
          content_version: "2026-07-09T12:00:00.000Z",
        },
      }),
    });

    vi.stubGlobal("fetch", fetchMock);

    const data = await fetchEventOgData("https://events.example.com", "boda");

    expect(data).toMatchObject({
      name: "Boda",
      identifier: "boda",
      description: "Celebra con nosotros",
      cover_image_url:
        "https://events.example.com/storage/events/boda/cover.webp",
      cover_view_url: "https://cdn.example.com/signed-cover.webp",
      view_url: "https://cdn.example.com/signed-cover.webp",
      event_date_time: "2026-08-15T20:30:00Z",
      address: "Salon Central",
      organizer_name: "Ana y Luis",
      event_type: "wedding",
      content_version: "2026-07-09T12:00:00.000Z",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("reads direct payloads from the meta endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        name: "Evento directo",
        cover_image_url: "https://cdn.example.com/cover.webp",
      }),
    });

    vi.stubGlobal("fetch", fetchMock);

    const data = await fetchEventOgData(
      "https://events.example.com",
      "directo",
    );

    expect(data).toMatchObject({
      name: "Evento directo",
      cover_image_url: "https://cdn.example.com/cover.webp",
    });
  });

  it("normalizes aliased payloads from the primary meta endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        status: 200,
        data: {
          EventIdentifier: "alias",
          Name: "Evento Alias",
          Description: "Alias listo para compartir",
          coverImageUrl: "events/alias/cover.webp",
          coverViewUrl: "https://cdn.example.com/alias-signed.webp",
          coverViewUrlExpiresAt: "2026-03-01T12:05:00Z",
          viewUrlExpiresAt: "2026-03-01T12:04:00Z",
          eventDateTime: "2026-09-01T19:00:00-06:00",
          Address: "Jardin Central",
          secondAddress: "Salon Alias",
          TimeZone: "America/Mexico_City",
          Locale: "es",
          organizerName: "Familia Alias",
          eventType: { name: "graduation" },
        },
      }),
    });

    vi.stubGlobal("fetch", fetchMock);

    const data = await fetchEventOgData("https://events.example.com", "alias");

    expect(data).toMatchObject({
      name: "Evento Alias",
      identifier: "alias",
      description: "Alias listo para compartir",
      cover_image_url:
        "https://events.example.com/storage/events/alias/cover.webp",
      cover_view_url: "https://cdn.example.com/alias-signed.webp",
      cover_view_url_expires_at: "2026-03-01T12:05:00Z",
      view_url_expires_at: "2026-03-01T12:04:00Z",
      view_url: "https://cdn.example.com/alias-signed.webp",
      event_date_time: "2026-09-01T19:00:00-06:00",
      address: "Jardin Central",
      second_address: "Salon Alias",
      timezone: "America/Mexico_City",
      language: "es",
      organizer_name: "Familia Alias",
      event_type: "graduation",
    });
  });

  it("normalizes Pascal Url cover aliases from the primary meta endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        Status: 200,
        Data: {
          Name: "Evento Pascal",
          CoverImageUrl: "events/pascal/cover.webp",
          CoverViewUrl: "https://cdn.example.com/pascal-signed.webp",
          CoverViewUrlExpiresAt: "2026-03-01T12:05:00Z",
          ViewUrlExpiresAt: "2026-03-01T12:04:00Z",
        },
      }),
    });

    vi.stubGlobal("fetch", fetchMock);

    const data = await fetchEventOgData("https://events.example.com", "pascal");

    expect(data).toMatchObject({
      name: "Evento Pascal",
      cover_image_url:
        "https://events.example.com/storage/events/pascal/cover.webp",
      cover_view_url: "https://cdn.example.com/pascal-signed.webp",
      cover_view_url_expires_at: "2026-03-01T12:05:00Z",
      view_url: "https://cdn.example.com/pascal-signed.webp",
      view_url_expires_at: "2026-03-01T12:04:00Z",
    });
  });

  it("drops Go zero dates from backend meta payloads", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        status: 200,
        data: {
          name: "Sin fecha",
          event_date_time: "0001-01-01T00:00:00Z",
        },
      }),
    });

    vi.stubGlobal("fetch", fetchMock);

    const data = await fetchEventOgData(
      "https://events.example.com",
      "sin-fecha",
    );

    expect(data).toMatchObject({ name: "Sin fecha" });
    expect(data?.event_date_time).toBeUndefined();
  });

  it("uses no-store when fetching private OG data with an invitation token", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        status: 200,
        data: { name: "Privado" },
      }),
    });

    vi.stubGlobal("fetch", fetchMock);

    await fetchEventOgData(
      "https://events.example.com",
      "privado",
      "",
      "",
      "invite/123",
    );

    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://events.example.com/api/events/privado/meta?token=invite%2F123",
    );
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ cache: "no-store" });
  });

  it("sends the event access proof header to meta and page-spec fallback fetches", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 404 })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: 200,
          data: {
            meta: {
              pageTitle: "Privado verificado",
              coverImageUrl: "events/private/cover.webp",
            },
          },
        }),
      });

    vi.stubGlobal("fetch", fetchMock);

    const data = await fetchEventOgData(
      "https://events.example.com",
      "privado",
      "",
      "",
      "",
      " proof/123 ",
    );

    expect(data).toMatchObject({
      name: "Privado verificado",
      cover_image_url:
        "https://events.example.com/storage/events/private/cover.webp",
    });
    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://events.example.com/api/events/privado/meta",
    );
    expect(fetchMock.mock.calls[1][0]).toBe(
      "https://events.example.com/api/events/privado/page-spec",
    );
    for (const [, init] of fetchMock.mock.calls) {
      expect(init).toMatchObject({ cache: "no-store" });
      expect(new Headers(init?.headers).get("X-Event-Access-Token")).toBe(
        "proof/123",
      );
    }
  });

  it("does not fallback to page-spec when the meta endpoint denies access", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 403,
      json: async () => ({
        status: 403,
        message: "Event is not public",
      }),
    });

    vi.stubGlobal("fetch", fetchMock);

    await expect(
      fetchEventOgData("https://events.example.com", "privado"),
    ).resolves.toBeNull();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://events.example.com/api/events/privado/meta",
    );
  });

  it("resolves raw page-spec cover keys in the fallback path", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 404 })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: 200,
          message: "loaded",
          data: {
            meta: {
              pageTitle: "Graduacion",
              identifier: "grad",
              coverImageUrl: "events/grad/cover.webp",
              coverImageUrlExpiresAt: "2026-03-01T12:05:00.000Z",
              eventType: "graduation",
              language: "en",
              timezone: "America/Chicago",
              secondAddress: "Ballroom",
              contentVersion: "2026-07-09T13:00:00.000Z",
            },
          },
        }),
      });

    vi.stubGlobal("fetch", fetchMock);

    const data = await fetchEventOgData(
      "https://events.example.com",
      "grad",
      "preview-token",
      "42",
      "invite/123",
    );

    expect(data).toMatchObject({
      name: "Graduacion",
      identifier: "grad",
      cover_image_url:
        "https://events.example.com/storage/events/grad/cover.webp",
      view_url: "https://events.example.com/storage/events/grad/cover.webp",
      cover_view_url_expires_at: "2026-03-01T12:05:00.000Z",
      view_url_expires_at: "2026-03-01T12:05:00.000Z",
      event_type: "graduation",
      language: "en",
      timezone: "America/Chicago",
      second_address: "Ballroom",
      content_version: "2026-07-09T13:00:00.000Z",
    });
    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://events.example.com/api/events/grad/meta?preview_token=preview-token&t=42&token=invite%2F123",
    );
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ cache: "no-store" });
    expect(fetchMock.mock.calls[1][0]).toBe(
      "https://events.example.com/api/events/grad/page-spec?preview_token=preview-token&t=42&token=invite%2F123",
    );
    expect(fetchMock.mock.calls[1][1]).toMatchObject({ cache: "no-store" });
  });

  it("uses signed page-spec cover aliases in the fallback OG path", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 404 })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: 200,
          data: {
            meta: {
              pageTitle: "Evento firmado",
              coverImageUrl: " ",
              view_url: "https://cdn.example.com/page-spec-cover.webp",
              view_url_expires_at: "2026-03-01T12:05:00.000Z",
            },
          },
        }),
      });

    vi.stubGlobal("fetch", fetchMock);

    const data = await fetchEventOgData(
      "https://events.example.com",
      "firmado",
    );

    expect(data).toMatchObject({
      name: "Evento firmado",
      cover_image_url: "",
      cover_view_url: "https://cdn.example.com/page-spec-cover.webp",
      view_url: "https://cdn.example.com/page-spec-cover.webp",
      cover_view_url_expires_at: "2026-03-01T12:05:00.000Z",
      view_url_expires_at: "2026-03-01T12:05:00.000Z",
    });
  });

  it("reads direct page-spec payloads in the fallback path", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 404 })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          meta: {
            pageTitle: "XV",
            contact: { name: "Familia" },
            coverImageUrl: "events/xv/cover.webp",
            eventDate: "2026-09-12T19:00:00-06:00",
          },
        }),
      });

    vi.stubGlobal("fetch", fetchMock);

    const data = await fetchEventOgData("https://events.example.com", "xv");

    expect(data).toMatchObject({
      name: "XV",
      organizer_name: "Familia",
      cover_image_url:
        "https://events.example.com/storage/events/xv/cover.webp",
      event_date_time: "2026-09-12T19:00:00-06:00",
    });
  });

  it("drops Go zero dates from page-spec fallback payloads", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 404 })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            meta: {
              pageTitle: "Sin fecha",
              eventDateTime: "0001-01-01T00:00:00Z",
            },
          },
        }),
      });

    vi.stubGlobal("fetch", fetchMock);

    const data = await fetchEventOgData(
      "https://events.example.com",
      "sin-fecha",
    );

    expect(data).toMatchObject({ name: "Sin fecha" });
    expect(data?.event_date_time).toBeUndefined();
  });
});

describe("readInvitationEventOgData", () => {
  it("reads event data from the backend public invitation lookup envelope", () => {
    const data = readInvitationEventOgData(
      {
        status: 200,
        message: "Invitation loaded",
        data: {
          pretty_token: "ABC-123",
          event: {
            identifier: "boda-ana-luis",
            name: "Boda Ana y Luis",
            description: "Celebremos juntos este gran dia",
            cover_image_url: "events/boda/cover.webp",
            view_url: "https://cdn.example.com/invitation-cover.webp",
            event_date_time: "2026-08-15T20:30:00-06:00",
            address: "Hacienda Centro",
            second_address: "Salon Hacienda",
            timezone: "America/Mexico_City",
            language: "es",
            organizer_name: "Ana y Luis",
            event_type: "wedding",
          },
          invitation: {
            id: "inv-1",
            event_id: "event-1",
            max_guests: 3,
          },
          guest: {
            first_name: "Ana",
            last_name: "Garcia",
          },
        },
      },
      "https://events.example.com",
    );

    expect(data).toMatchObject({
      name: "Boda Ana y Luis",
      identifier: "boda-ana-luis",
      description: "Celebremos juntos este gran dia",
      cover_image_url:
        "https://events.example.com/storage/events/boda/cover.webp",
      cover_view_url: "https://cdn.example.com/invitation-cover.webp",
      view_url: "https://cdn.example.com/invitation-cover.webp",
      event_date_time: "2026-08-15T20:30:00-06:00",
      address: "Hacienda Centro",
      second_address: "Salon Hacienda",
      timezone: "America/Mexico_City",
      language: "es",
      organizer_name: "Ana y Luis",
      event_type: "wedding",
    });
  });

  it("drops Go zero dates from invitation lookup event metadata", () => {
    const data = readInvitationEventOgData({
      data: {
        event: {
          name: "Invitacion sin fecha",
          event_date_time: "0001-01-01T00:00:00Z",
        },
      },
    });

    expect(data).toMatchObject({ name: "Invitacion sin fecha" });
    expect(data?.event_date_time).toBeUndefined();
  });

  it("reads Pascal-cased backend invitation lookup envelopes", () => {
    const data = readInvitationEventOgData(
      {
        Status: 200,
        Message: "Invitation loaded",
        Data: {
          Event: {
            Identifier: "graduacion-2026",
            Name: "Graduacion 2026",
            CoverImageURL: "events/grad/cover.webp",
            EventDateTime: "2026-07-18T20:00:00-06:00",
          },
        },
      },
      "https://events.example.com",
    );

    expect(data).toMatchObject({
      name: "Graduacion 2026",
      identifier: "graduacion-2026",
      cover_image_url:
        "https://events.example.com/storage/events/grad/cover.webp",
      event_date_time: "2026-07-18T20:00:00-06:00",
    });
  });

  it("uses useful Pascal Data when canonical envelope data is empty", () => {
    const data = readInvitationEventOgData(
      {
        Status: 200,
        Message: "Invitation loaded",
        data: {},
        Data: {
          Event: {
            Name: "Boda Alias",
            EventDateTime: "2026-09-12T19:30:00-06:00",
            CoverViewURL: "events/alias/view.webp",
          },
        },
      },
      "https://events.example.com",
    );

    expect(data).toMatchObject({
      name: "Boda Alias",
      event_date_time: "2026-09-12T19:30:00-06:00",
      cover_view_url:
        "https://events.example.com/storage/events/alias/view.webp",
      view_url: "https://events.example.com/storage/events/alias/view.webp",
    });
  });

  it("uses useful nested Event aliases before empty canonical event records", () => {
    const data = readInvitationEventOgData({
      data: {
        event: {},
        invitation: {
          id: "inv-empty-event",
        },
        Invitation: {
          Event: {
            Name: "Evento desde invitacion alias",
            EventType: {
              Code: "wedding",
            },
            EventDateTime: "2026-10-03T18:00:00-06:00",
          },
        },
      },
    });

    expect(data).toMatchObject({
      name: "Evento desde invitacion alias",
      event_type: "wedding",
      event_date_time: "2026-10-03T18:00:00-06:00",
    });
  });

  it("keeps compatibility with nested legacy invitation event data", () => {
    const data = readInvitationEventOgData({
      data: {
        invitation: {
          event: {
            name: "Evento Legacy",
            event_type: { name: "graduation" },
          },
        },
      },
    });

    expect(data).toMatchObject({
      name: "Evento Legacy",
      event_type: "graduation",
    });
  });

  it("returns null when the invitation payload has no event object", () => {
    expect(readInvitationEventOgData({ data: { invitation: {} } })).toBeNull();
  });
});

describe("fetchInvitationOgData", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetches invitation OG data through the API envelope helper", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        status: 200,
        message: "Invitation loaded",
        data: {
          event: {
            name: "Evento desde token",
            cover_image_url: "events/token/cover.webp",
            view_url: "events/token/signed.webp",
          },
          invitation: {
            id: "inv-token",
          },
        },
      }),
    });

    vi.stubGlobal("fetch", fetchMock);

    const data = await fetchInvitationOgData(
      "https://events.example.com",
      "TOKEN/123",
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "https://events.example.com/api/invitations/ByToken?token=TOKEN%2F123",
      expect.objectContaining({
        cache: "no-store",
        signal: expect.any(AbortSignal),
      }),
    );
    expect(fetchMock.mock.calls[0][1]?.headers).toBeUndefined();
    expect(data).toMatchObject({
      name: "Evento desde token",
      cover_image_url:
        "https://events.example.com/storage/events/token/cover.webp",
      cover_view_url:
        "https://events.example.com/storage/events/token/signed.webp",
      view_url: "https://events.example.com/storage/events/token/signed.webp",
    });
  });

  it("returns null instead of throwing when invitation lookup fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({
          status: 401,
          message: "Invalid or expired token",
          error: "token expired",
        }),
      }),
    );

    await expect(
      fetchInvitationOgData("https://events.example.com", "BAD"),
    ).resolves.toBeNull();
  });
});
