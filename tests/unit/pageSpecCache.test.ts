import { describe, expect, it } from "vitest";
import type { PageSpec } from "../../src/components/engine/types";
import {
  IDENTIFIER_PAGE_SPEC_CACHE_TTL_MS,
  TOKEN_PAGE_SPEC_CACHE_TTL_MS,
  getPageSpecCacheExpiresAt,
  getPageSpecCoverExpiry,
  getPageSpecThemeFontExpiry,
  normalizePageSpec,
  pageSpecCacheKey,
  readPageSpecMetaPayload,
  readPageSpecPayload,
  readPageSpecCache,
  removePageSpecCache,
  shouldRenderCachedPageSpecBeforeRevalidate,
  shouldRenderPageSpecCacheBeforeRevalidate,
  writePageSpecCache,
} from "../../src/lib/pageSpecCache";

class MemoryStorage {
  private values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }

  removeItem(key: string) {
    this.values.delete(key);
  }
}

const spec: PageSpec = {
  meta: {
    pageTitle: "Evento",
    footerVisible: true,
  },
  sections: [],
};

function presignedUrl(date: string, expires: number): string {
  return `https://cdn.example.com/cover.webp?X-Amz-Date=${date}&X-Amz-Expires=${expires}&X-Amz-Signature=test`;
}

describe("pageSpecCache", () => {
  it("keeps token page specs for the token TTL", () => {
    const storage = new MemoryStorage();
    writePageSpecCache("ABC123", spec, "token", storage, 1_000);

    expect(
      readPageSpecCache(
        "ABC123",
        "token",
        storage,
        1_000 + TOKEN_PAGE_SPEC_CACHE_TTL_MS - 1,
      ),
    ).toEqual(spec);
  });

  it("expires identifier page specs faster so dashboard changes become visible", () => {
    const storage = new MemoryStorage();
    writePageSpecCache("mi-evento", spec, "identifier", storage, 1_000);

    expect(
      readPageSpecCache(
        "mi-evento",
        "identifier",
        storage,
        1_000 + IDENTIFIER_PAGE_SPEC_CACHE_TTL_MS + 1,
      ),
    ).toBeNull();
    expect(
      storage.getItem(pageSpecCacheKey("mi-evento", "identifier")),
    ).toBeNull();
  });

  it("expires cached page specs before an explicitly signed cover URL expires", () => {
    const storage = new MemoryStorage();
    const cachedAt = Date.parse("2026-03-01T12:00:00.000Z");
    const signedCoverSpec: PageSpec = {
      meta: {
        pageTitle: "Evento",
        coverImageUrl: "https://cdn.example.com/cover.webp",
        coverImageUrlExpiresAt: "2026-03-01T12:01:30.000Z",
      },
      sections: [],
    };

    writePageSpecCache("ABC123", signedCoverSpec, "token", storage, cachedAt);

    expect(
      readPageSpecCache("ABC123", "token", storage, cachedAt + 29_999),
    ).toEqual(signedCoverSpec);
    expect(
      readPageSpecCache("ABC123", "token", storage, cachedAt + 30_001),
    ).toBeNull();
  });

  it("uses presigned cover URL query params when cached page specs lack explicit expiry metadata", () => {
    const storage = new MemoryStorage();
    const cachedAt = Date.parse("2026-03-01T12:00:00.000Z");
    const legacySignedCoverSpec: PageSpec = {
      meta: {
        pageTitle: "Evento",
        coverImageUrl: presignedUrl("20260301T120000Z", 120),
      },
      sections: [],
    };

    writePageSpecCache(
      "ABC123",
      legacySignedCoverSpec,
      "token",
      storage,
      cachedAt,
    );

    expect(
      readPageSpecCache("ABC123", "token", storage, cachedAt + 59_999),
    ).toEqual(legacySignedCoverSpec);
    expect(
      readPageSpecCache("ABC123", "token", storage, cachedAt + 60_001),
    ).toBeNull();
  });

  it("uses the earliest expiry between explicit metadata and signed URL params", () => {
    const mixedExpirySpec: PageSpec = {
      meta: {
        pageTitle: "Evento",
        coverViewUrl: presignedUrl("20260301T120000Z", 60),
        coverViewUrlExpiresAt: "2026-03-01T12:05:00.000Z",
        theme: {
          fonts: { heading: "Cormorant Garamond" },
          fontViewUrls: {
            heading: presignedUrl("20260301T120000Z", 75),
          },
          fontViewUrlsExpiresAt: "2026-03-01T12:03:00.000Z",
        },
      },
      sections: [],
    };

    expect(getPageSpecCoverExpiry(mixedExpirySpec)?.toISOString()).toBe(
      "2026-03-01T12:01:00.000Z",
    );
    expect(getPageSpecThemeFontExpiry(mixedExpirySpec)?.toISOString()).toBe(
      "2026-03-01T12:01:15.000Z",
    );
  });

  it("expires cached page specs before explicitly signed theme font URLs expire", () => {
    const storage = new MemoryStorage();
    const cachedAt = Date.parse("2026-03-01T12:00:00.000Z");
    const signedFontSpec: PageSpec = {
      meta: {
        pageTitle: "Evento",
        theme: {
          fonts: { heading: "Cormorant Garamond" },
          fontUrls: { heading: "base/fonts/cormorant.woff2" },
          fontViewUrls: {
            heading: "https://signed.example.com/base/fonts/cormorant.woff2",
          },
          fontViewUrlsExpiresAt: "2026-03-01T12:01:45.000Z",
        },
      },
      sections: [],
    };

    writePageSpecCache("ABC123", signedFontSpec, "token", storage, cachedAt);

    expect(getPageSpecThemeFontExpiry(signedFontSpec)?.toISOString()).toBe(
      "2026-03-01T12:01:45.000Z",
    );
    expect(
      readPageSpecCache("ABC123", "token", storage, cachedAt + 44_999),
    ).toEqual(signedFontSpec);
    expect(
      readPageSpecCache("ABC123", "token", storage, cachedAt + 45_001),
    ).toBeNull();
  });

  it("computes page spec cache expiry from fixed TTL when cover media is not signed", () => {
    const cachedAt = Date.parse("2026-03-01T12:00:00.000Z");

    expect(getPageSpecCoverExpiry(spec)).toBeNull();
    expect(getPageSpecCacheExpiresAt(spec, "token", cachedAt)).toBe(
      cachedAt + TOKEN_PAGE_SPEC_CACHE_TTL_MS,
    );
  });

  it("removes malformed cache entries", () => {
    const storage = new MemoryStorage();
    storage.setItem(pageSpecCacheKey("broken", "token"), "{");

    expect(readPageSpecCache("broken", "token", storage, 1_000)).toBeNull();
    expect(storage.getItem(pageSpecCacheKey("broken", "token"))).toBeNull();
  });

  it("isolates token and identifier caches with the same id", () => {
    const storage = new MemoryStorage();
    const tokenSpec: PageSpec = {
      meta: { pageTitle: "Token", footerVisible: true },
      sections: [],
    };
    const identifierSpec: PageSpec = {
      meta: { pageTitle: "Identifier", footerVisible: true },
      sections: [],
    };

    writePageSpecCache("same-value", tokenSpec, "token", storage, 1_000);
    writePageSpecCache(
      "same-value",
      identifierSpec,
      "identifier",
      storage,
      1_000,
    );

    expect(readPageSpecCache("same-value", "token", storage, 1_001)).toEqual(
      tokenSpec,
    );
    expect(
      readPageSpecCache("same-value", "identifier", storage, 1_001),
    ).toEqual(identifierSpec);
  });

  it("isolates cache entries by backend namespace", () => {
    const storage = new MemoryStorage();
    const prodSpec: PageSpec = {
      meta: { pageTitle: "Produccion", footerVisible: true },
      sections: [],
    };
    const stagingSpec: PageSpec = {
      meta: { pageTitle: "Staging", footerVisible: true },
      sections: [],
    };

    writePageSpecCache(
      "mi-evento",
      prodSpec,
      "identifier",
      storage,
      1_000,
      "https://api.eventiapp.com.mx/",
    );
    writePageSpecCache(
      "mi-evento",
      stagingSpec,
      "identifier",
      storage,
      1_000,
      "https://staging.example.com/eventi-api/",
    );

    expect(
      readPageSpecCache(
        "mi-evento",
        "identifier",
        storage,
        1_001,
        "https://api.eventiapp.com.mx/",
      ),
    ).toEqual(prodSpec);
    expect(
      readPageSpecCache(
        "mi-evento",
        "identifier",
        storage,
        1_001,
        "https://staging.example.com/eventi-api/",
      ),
    ).toEqual(stagingSpec);
    expect(
      readPageSpecCache("mi-evento", "identifier", storage, 1_001),
    ).toBeNull();
  });

  it("removes page-spec cache entries using the same scoped namespace", () => {
    const storage = new MemoryStorage();
    const namespace = "https://api.eventiapp.com.mx/";

    writePageSpecCache(
      "mi-evento",
      spec,
      "identifier",
      storage,
      1_000,
      namespace,
    );
    writePageSpecCache(
      "mi-evento",
      spec,
      "identifier",
      storage,
      1_000,
      "https://staging.example.com/",
    );

    expect(
      readPageSpecCache("mi-evento", "identifier", storage, 1_001, namespace),
    ).toEqual(spec);

    removePageSpecCache("mi-evento", "identifier", storage, namespace);

    expect(
      readPageSpecCache("mi-evento", "identifier", storage, 1_001, namespace),
    ).toBeNull();
    expect(
      readPageSpecCache("mi-evento", "identifier", storage, 1_001, "https://staging.example.com/"),
    ).toEqual(spec);
  });

  it("does not expose raw invitation tokens in page-spec cache keys", () => {
    const key = pageSpecCacheKey("mi-evento:invite/secret-token", "identifier");

    expect(key).toMatch(/^pageSpec-identifier-[a-z0-9]+$/);
    expect(key).not.toContain("mi-evento");
    expect(key).not.toContain("invite");
    expect(key).not.toContain("secret-token");
  });

  it("does not expose raw password proofs in page-spec cache keys", () => {
    const key = pageSpecCacheKey(
      "mi-evento:invite/secret-token:access:proof/secret-token",
      "identifier",
      "api-prod",
    );

    expect(key).toMatch(/^pageSpec-identifier-api-prod-[a-z0-9]+$/);
    expect(key).not.toContain("mi-evento");
    expect(key).not.toContain("invite");
    expect(key).not.toContain("proof");
    expect(key).not.toContain("secret-token");
  });

  it("renders cached token specs immediately before background revalidation", () => {
    expect(shouldRenderPageSpecCacheBeforeRevalidate("token")).toBe(true);
  });

  it("does not render cached public identifier specs before backend revalidation", () => {
    expect(shouldRenderPageSpecCacheBeforeRevalidate("identifier")).toBe(false);
  });

  it("renders cached identifier specs immediately when scoped by invitation token", () => {
    expect(shouldRenderPageSpecCacheBeforeRevalidate("identifier", true)).toBe(
      true,
    );
  });

  it("does not render cached full-content specs before access revalidation", () => {
    expect(
      shouldRenderCachedPageSpecBeforeRevalidate("token", {
        ...spec,
        meta: {
          ...spec.meta,
          access: { passwordProtected: false, passwordVerified: false },
        },
      }),
    ).toBe(false);
  });

  it("can render cached password gates before access revalidation", () => {
    expect(
      shouldRenderCachedPageSpecBeforeRevalidate("token", {
        ...spec,
        meta: {
          ...spec.meta,
          access: { passwordProtected: true, passwordVerified: false },
        },
      }),
    ).toBe(true);
  });

  it("does not render cached verified password content before access revalidation", () => {
    expect(
      shouldRenderCachedPageSpecBeforeRevalidate("token", {
        ...spec,
        meta: {
          ...spec.meta,
          access: { passwordProtected: true, passwordVerified: true },
        },
      }),
    ).toBe(false);
  });

  it("does not render cached preview-authorized content before access revalidation", () => {
    expect(
      shouldRenderCachedPageSpecBeforeRevalidate("token", {
        ...spec,
        meta: {
          ...spec.meta,
          access: { passwordProtected: true, previewAuthorized: true },
        },
      }),
    ).toBe(false);
  });

  it("normalizes legacy encoded section configs to objects", () => {
    const legacySpec = {
      meta: { pageTitle: "Evento", footerVisible: true },
      sections: [
        {
          type: "MAP",
          sectionId: "section-1",
          order: 1,
          config: '{"title":"Ubicacion","mapUrl":"https://maps.example.com"}',
        },
      ],
    } as unknown as PageSpec;

    expect(normalizePageSpec(legacySpec).sections[0]?.config).toEqual({
      title: "Ubicacion",
      mapUrl: "https://maps.example.com",
    });
  });

  it("falls back to legacy content_json aliases for section configs", () => {
    const legacySpec = {
      meta: { pageTitle: "Evento", footerVisible: true },
      sections: [
        {
          type: "GALLERY",
          sectionId: "gallery",
          order: 1,
          content_json: { title: "Fotos" },
        },
        {
          type: "AGENDA",
          sectionId: "agenda",
          order: 2,
          config: null,
          contentJson: '{"title":"Programa"}',
        },
        {
          type: "MAP",
          sectionId: "map",
          order: 3,
          ContentJSON: { title: "Mapa" },
        },
        {
          type: "HERO",
          sectionId: "hero",
          order: 4,
          config: { title: "Canonico" },
          content_json: { title: "Legacy" },
        },
        {
          type: "MAP",
          sectionId: "map-empty-config",
          order: 5,
          config: {},
          content_json: { title: "Mapa desde legacy" },
        },
        {
          type: "TEXT",
          sectionId: "text-empty-config",
          order: 6,
          config: "{}",
          contentJson: '{"content":"Texto desde legacy"}',
        },
      ],
    } as unknown as PageSpec;

    expect(
      normalizePageSpec(legacySpec).sections.map((section) => section.config),
    ).toEqual([
      { title: "Fotos" },
      { title: "Programa" },
      { title: "Mapa" },
      { title: "Canonico" },
      { title: "Mapa desde legacy" },
      { content: "Texto desde legacy" },
    ]);
  });

  it("normalizes contact/text sections with the text contract instead of agenda items", () => {
    const normalized = readPageSpecPayload({
      Data: {
        Meta: { PageTitle: "Evento" },
        Sections: [
          {
            Type: "ContactSection",
            SectionID: "contact",
            Order: 1,
            Config: {
              Title: "Contacto",
              Body: "Mesa de regalos y dudas",
              Items: [{ Time: "20:00", Title: "No es agenda" }],
            },
          },
        ],
      },
    });

    const config = normalized?.sections[0]?.config;
    expect(config).toMatchObject({
      Title: "Contacto",
      Body: "Mesa de regalos y dudas",
      title: "Contacto",
      content: "Mesa de regalos y dudas",
    });
    expect(config).not.toHaveProperty("items");
  });

  it("normalizes gallery sections without inheriting hero-only content fields", () => {
    const normalized = readPageSpecPayload({
      Data: {
        Meta: { PageTitle: "Evento" },
        Sections: [
          {
            Type: "LegacyGallery",
            SectionID: "gallery",
            Order: 1,
            Config: {
              Title: "Fotos",
              Subtitle: "Nuestros momentos",
              Body: "No debe convertirse en content",
              ImageURL: "https://cdn.example.com/cover.webp",
            },
          },
        ],
      },
    });

    const config = normalized?.sections[0]?.config;
    expect(config).toMatchObject({
      Title: "Fotos",
      Subtitle: "Nuestros momentos",
      title: "Fotos",
      subtitle: "Nuestros momentos",
      Body: "No debe convertirse en content",
      ImageURL: "https://cdn.example.com/cover.webp",
    });
    expect(config).not.toHaveProperty("content");
    expect(config).not.toHaveProperty("imageUrl");
  });

  it("normalizes dashboard EventSection aliases into public sections", () => {
    const normalized = readPageSpecPayload({
      meta: { pageTitle: "Evento" },
      sections: [
        {
          id: "section-dashboard-1",
          component_type: "LegacyHero",
          order: "4",
          config: { title: "Portada" },
        },
        {
          event_section_id: "section-dashboard-2",
          componentType: "AgendaSection",
          Order: 2,
          content_json: { title: "Programa" },
        },
      ],
    });

    expect(normalized?.sections).toEqual([
      {
        type: "AgendaSection",
        sectionId: "section-dashboard-2",
        order: 2,
        config: { title: "Programa" },
      },
      {
        type: "LegacyHero",
        sectionId: "section-dashboard-1",
        order: 4,
        config: { title: "Portada" },
      },
    ]);
  });

  it("normalizes Pascal EventSection aliases into public sections", () => {
    const normalized = readPageSpecPayload({
      Meta: { PageTitle: "Evento" },
      Sections: [
        {
          ID: "section-pascal",
          ComponentType: "RSVPConfirmation",
          SectionTitle: "Confirmacion",
          SortOrder: "3",
          ContentJSON: { WelcomeMessage: "Hola" },
          IsVisible: true,
        },
      ],
    });

    expect(normalized?.sections).toEqual([
      {
        type: "RSVPConfirmation",
        title: "Confirmacion",
        sectionId: "section-pascal",
        order: 3,
        config: {
          WelcomeMessage: "Hola",
          welcome_message: "Hola",
        },
      },
    ]);
  });

  it("normalizes imported section aliases with the same config contracts", () => {
    const normalized = readPageSpecPayload({
      meta: { pageTitle: "Evento" },
      sections: [
        {
          id: "agenda",
          type: "AGENDA",
          order: 1,
          config: { AgendaItems: [{ Time: "20:00", Name: "Cena" }] },
        },
        {
          id: "moment-wall",
          type: "MOMENT_WALL",
          order: 2,
          config: {
            Identifier: "mi-evento",
            ShareUploadsEnabled: true,
            MomentsWallPublished: true,
          },
        },
        {
          id: "hosts",
          type: "HOSTS",
          order: 3,
          config: { Content: "Gracias por acompaÃ±arnos" },
        },
        {
          id: "rsvp",
          type: "RSVP",
          order: 4,
          config: { DefaultWelcomeMessage: "Bienvenido" },
        },
      ],
    });

    expect(normalized?.sections.map((section) => section.type)).toEqual([
      "AGENDA",
      "MOMENT_WALL",
      "HOSTS",
      "RSVP",
    ]);
    expect(normalized?.sections[0]?.config.items).toEqual([
      { Time: "20:00", Name: "Cena", time: "20:00", title: "Cena" },
    ]);
    expect(normalized?.sections[1]?.config).toMatchObject({
      Identifier: "mi-evento",
      identifier: "mi-evento",
      moments_wall_published: true,
      allow_uploads: false,
      share_uploads_enabled: false,
    });
    expect(normalized?.sections[2]?.config).toMatchObject({
      Content: "Gracias por acompaÃ±arnos",
      closing: "Gracias por acompaÃ±arnos",
    });
    expect(normalized?.sections[3]?.config).toMatchObject({
      DefaultWelcomeMessage: "Bienvenido",
      welcome_message: "Bienvenido",
    });
  });

  it("keeps graduates and host attendee sections distinct while sharing the closing config contract", () => {
    const normalized = readPageSpecPayload({
      meta: { pageTitle: "Evento" },
      sections: [
        {
          id: "graduates",
          type: "GraduatesList",
          order: 1,
          config: { Content: "Celebremos juntos" },
        },
        {
          id: "host-section",
          type: "HOST_SECTION",
          order: 2,
          config: { Content: "Gracias por recibirnos" },
        },
      ],
    });

    expect(normalized?.sections.map((section) => section.type)).toEqual([
      "GraduatesList",
      "HOST_SECTION",
    ]);
    expect(normalized?.sections[0]?.config).toMatchObject({
      Content: "Celebremos juntos",
      closing: "Celebremos juntos",
    });
    expect(normalized?.sections[1]?.config).toMatchObject({
      Content: "Gracias por recibirnos",
      closing: "Gracias por recibirnos",
    });
  });

  it("skips dashboard sections hidden by visibility aliases", () => {
    const normalized = readPageSpecPayload({
      meta: { pageTitle: "Evento" },
      sections: [
        {
          id: "visible-section",
          component_type: "LegacyHero",
          is_visible: true,
          config: { title: "Visible" },
        },
        {
          id: "hidden-snake",
          component_type: "AgendaSection",
          is_visible: false,
          config: { title: "Oculta" },
        },
        {
          id: "hidden-camel",
          componentType: "MomentWall",
          isVisible: "false",
          config: {},
        },
        {
          id: "missing-type",
          component_type: " ",
          is_visible: true,
          config: { title: "Sin tipo" },
        },
      ],
    });

    expect(normalized?.sections).toEqual([
      {
        type: "LegacyHero",
        sectionId: "visible-section",
        order: 0,
        config: { title: "Visible" },
      },
    ]);
  });

  it("accepts sort order aliases when normalizing public sections", () => {
    const normalized = readPageSpecPayload({
      meta: { pageTitle: "Evento" },
      sections: [
        {
          id: "section-camel",
          componentType: "AgendaSection",
          sortOrder: "3",
          config: {},
        },
        {
          id: "section-snake",
          componentType: "MomentWall",
          sort_order: 1,
          config: {},
        },
      ],
    });

    expect(
      normalized?.sections.map((section) => ({
        id: section.sectionId,
        order: section.order,
      })),
    ).toEqual([
      { id: "section-snake", order: 1 },
      { id: "section-camel", order: 3 },
    ]);
  });

  it("uses fallback order for blank sort order aliases", () => {
    const normalized = readPageSpecPayload({
      meta: { pageTitle: "Evento" },
      sections: [
        { id: "section-a", type: "LegacyHero", order: 0, config: {} },
        { id: "section-b", type: "AgendaSection", order: 1, config: {} },
        { id: "section-c", type: "MomentWall", sortOrder: " ", config: {} },
      ],
    });

    expect(
      normalized?.sections.map((section) => ({
        id: section.sectionId,
        order: section.order,
      })),
    ).toEqual([
      { id: "section-a", order: 0 },
      { id: "section-b", order: 1 },
      { id: "section-c", order: 2 },
    ]);
  });

  it("preserves backend MomentWall runtime flags for the public renderer", () => {
    const normalized = readPageSpecPayload({
      Status: 200,
      Message: "Page spec loaded",
      Data: {
        Meta: { PageTitle: "Boda Ana y Luis" },
        Sections: [
          {
            Type: "MomentWall",
            SectionID: "moments-section",
            Order: 1,
            Config: {
              identifier: "boda-ana-luis",
              allow_uploads: false,
              allow_messages: true,
              auto_approve_uploads: true,
              published: true,
              moments_wall_published: true,
              share_uploads_enabled: false,
              max_uploads_per_guest: 12,
              moment_request_message: "Sube tus mejores fotos",
              subtitle: "Sube tus mejores fotos",
            },
          },
        ],
      },
    });

    expect(normalized?.sections[0]).toEqual({
      type: "MomentWall",
      sectionId: "moments-section",
      title: undefined,
      order: 1,
      config: {
        identifier: "boda-ana-luis",
        allow_uploads: false,
        allow_messages: true,
        auto_approve_uploads: true,
        published: true,
        moments_wall_published: true,
        show_moment_wall: true,
        share_uploads_enabled: false,
        max_uploads_per_guest: 12,
        moment_request_message: "Sube tus mejores fotos",
        subtitle: "Sube tus mejores fotos",
      },
    });
  });

  it("normalizes MomentWall runtime config aliases for the public renderer", () => {
    const normalized = readPageSpecPayload({
      Status: 200,
      Message: "Page spec loaded",
      Data: {
        Meta: { PageTitle: "Boda Ana y Luis" },
        Sections: [
          {
            ComponentType: "MomentWall",
            SectionID: "moments-section",
            SortOrder: "1",
            Config: {
              Identifier: "boda-ana-luis",
              AllowUploads: "true",
              AllowMessages: true,
              AutoApproveUploads: "true",
              show_wall: "false",
              ShareUploadsEnabled: "true",
              MaxUploadsPerGuest: "12",
              MomentRequestMessage: "Sube tus mejores fotos",
            },
          },
        ],
      },
    });

    expect(normalized?.sections[0]?.config).toMatchObject({
      identifier: "boda-ana-luis",
      allow_uploads: true,
      allow_messages: true,
      auto_approve_uploads: true,
      moments_wall_published: false,
      show_moment_wall: false,
      share_uploads_enabled: true,
      max_uploads_per_guest: 12,
      moment_request_message: "Sube tus mejores fotos",
    });
  });

  it("normalizes legacy camelCase MomentWall publication aliases", () => {
    const normalized = readPageSpecPayload({
      Data: {
        Meta: { PageTitle: "Boda Ana y Luis" },
        Sections: [
          {
            ComponentType: "MomentWall",
            SectionID: "moments-section",
            Config: {
              Identifier: "boda-ana-luis",
              AllowUploads: "true",
              showWall: "true",
              ShareUploadsEnabled: "true",
            },
          },
        ],
      },
    });

    expect(normalized?.sections[0]?.config).toMatchObject({
      identifier: "boda-ana-luis",
      moments_wall_published: true,
      show_moment_wall: true,
      allow_uploads: false,
      share_uploads_enabled: false,
    });
  });

  it("normalizes MomentWall upload flags to the effective public wall state", () => {
    const normalized = readPageSpecPayload({
      Data: {
        Meta: { PageTitle: "Boda Ana y Luis" },
        Sections: [
          {
            ComponentType: "MomentWall",
            SectionID: "moments-section",
            Config: {
              Identifier: "boda-ana-luis",
              AllowUploads: "true",
              Published: "true",
              MomentsWallPublished: "true",
              ShareUploadsEnabled: "true",
            },
          },
        ],
      },
    });

    expect(normalized?.sections[0]?.config).toMatchObject({
      identifier: "boda-ana-luis",
      published: true,
      moments_wall_published: true,
      show_moment_wall: true,
      allow_uploads: false,
      share_uploads_enabled: false,
    });
  });

  it("promotes legacy Published into canonical MomentWall publication aliases", () => {
    const normalized = readPageSpecPayload({
      Data: {
        Meta: { PageTitle: "Boda Ana y Luis" },
        Sections: [
          {
            ComponentType: "MomentWall",
            SectionID: "moments-section",
            Config: {
              Identifier: "boda-ana-luis",
              AllowUploads: "true",
              Published: "true",
              ShareUploadsEnabled: "true",
            },
          },
        ],
      },
    });

    expect(normalized?.sections[0]?.config).toMatchObject({
      identifier: "boda-ana-luis",
      published: true,
      moments_wall_published: true,
      show_moment_wall: true,
      allow_uploads: false,
      share_uploads_enabled: false,
    });
  });

  it("normalizes AgendaSection item aliases for the public renderer", () => {
    const normalized = readPageSpecPayload({
      Status: 200,
      Message: "Page spec loaded",
      Data: {
        Meta: { PageTitle: "Boda Ana y Luis" },
        Sections: [
          {
            ComponentType: "AgendaSection",
            SectionID: "agenda-section",
            Order: 2,
            Config: {
              Title: "Programa del dia",
              Subtitle: "Nos vemos ahi",
              Items: [
                {
                  Time: "18:00",
                  Title: "Ceremonia",
                  Description: "Llegar 15 minutos antes",
                  Icon: "ceremony",
                  Location: "Capilla principal",
                },
              ],
            },
          },
        ],
      },
    });

    expect(normalized?.sections[0]?.config).toMatchObject({
      title: "Programa del dia",
      subtitle: "Nos vemos ahi",
      items: [
        {
          time: "18:00",
          title: "Ceremonia",
          description: "Llegar 15 minutos antes",
          icon: "ceremony",
          location: "Capilla principal",
        },
      ],
    });
  });

  it("normalizes public section config aliases for the renderer", () => {
    const normalized = readPageSpecPayload({
      Status: 200,
      Message: "Page spec loaded",
      Data: {
        Meta: { PageTitle: "Boda Ana y Luis" },
        Sections: [
          {
            Type: "CountdownHeader",
            SectionID: "countdown-section",
            Order: 1,
            Config: {
              Heading: "El gran dia",
              TargetDate: "2026-08-15T20:30:00-06:00",
            },
          },
          {
            Type: "EventVenue",
            SectionID: "venue-section",
            Order: 2,
            Config: {
              Description: "Te esperamos para celebrar",
              EventDate: "Sabado 15 de agosto",
              VenueText: "Hacienda Central",
              MapURL: "https://maps.example.com/embed",
            },
          },
          {
            Type: "RSVPConfirmation",
            SectionID: "rsvp-section",
            Order: 3,
            Config: {
              DefaultWelcomeMessage: "Confirma tu asistencia",
              DefaultThankYouMessage: "Gracias por acompanarnos",
              DefaultGuestSignatureTitle: "Tu pase",
            },
          },
          {
            Type: "LegacyMap",
            SectionID: "legacy-map-section",
            Order: 4,
            Config: {
              Title: "Como llegar",
              Description: "Entrada por avenida principal",
              MapURL: "https://maps.example.com/legacy",
            },
          },
          {
            Type: "LegacyMusic",
            SectionID: "music-section",
            Order: 5,
            Config: {
              MusicURL: "https://cdn.example.com/song.mp3",
            },
          },
        ],
      },
    });
    const configFor = (type: string) =>
      normalized?.sections.find((section) => section.type === type)?.config;

    expect(configFor("CountdownHeader")).toMatchObject({
      heading: "El gran dia",
      targetDate: "2026-08-15T20:30:00-06:00",
    });
    expect(configFor("EventVenue")).toMatchObject({
      text: "Te esperamos para celebrar",
      date: "Sabado 15 de agosto",
      venueText: "Hacienda Central",
      mapUrl: "https://maps.example.com/embed",
    });
    expect(configFor("RSVPConfirmation")).toMatchObject({
      welcome_message: "Confirma tu asistencia",
      thank_you_message: "Gracias por acompanarnos",
      guest_signature_title: "Tu pase",
    });
    expect(configFor("LegacyMap")).toMatchObject({
      title: "Como llegar",
      content: "Entrada por avenida principal",
      mapUrl: "https://maps.example.com/legacy",
    });
    expect(configFor("LegacyMusic")).toMatchObject({
      musicUrl: "https://cdn.example.com/song.mp3",
    });
  });

  it("normalizes sections into the public render order with a stable tie-break", () => {
    const unorderedSpec = {
      meta: { pageTitle: "Evento", footerVisible: true },
      sections: [
        { type: "PhotoGrid", sectionId: "section-d", order: 3, config: {} },
        { type: "EventVenue", sectionId: "section-c", order: 2, config: {} },
        {
          type: "CountdownHeader",
          sectionId: "section-a",
          order: 1,
          config: {},
        },
        {
          type: "GraduationHero",
          sectionId: "section-b",
          order: 2,
          config: {},
        },
      ],
    } as unknown as PageSpec;

    expect(
      normalizePageSpec(unorderedSpec).sections.map(
        (section) => section.sectionId,
      ),
    ).toEqual(["section-a", "section-b", "section-c", "section-d"]);
  });

  it("normalizes page-spec API envelopes and casing aliases", () => {
    const normalized = readPageSpecPayload({
      Status: 200,
      Data: {
        Meta: {
          PageTitle: "Boda Ana y Luis",
          FooterVisible: "false",
          EventID: "event-1",
          EventDateTime: "2026-08-15T20:30:00-06:00",
          CoverImageURL: "events/event-1/cover.webp",
          CoverImageURLExpiresAt: "2026-03-01T12:05:00.000Z",
          SecondAddress: "Salon Principal",
          TimeZone: "America/Mexico_City",
          Locale: "es",
          ContentVersion: "2026-07-08T03:15:00.000Z",
          Access: {
            ActiveFrom: "2026-08-01T00:00:00-06:00",
            PasswordProtected: "true",
            AccessVersion: "2026-07-07T21:15:00Z",
            PreviewAuthorized: "true",
            PasswordVerified: "true",
          },
          Theme: {
            DesignTemplateId: "template-1",
            DesignTemplateIdentifier: "classic-elegant",
            ColorPaletteId: "palette-1",
            ColorPaletteName: "Dorada",
            FontSetId: "fontset-1",
            FontSetName: "Editorial",
            Colors: { PRIMARY: "#c8a45d" },
            Fonts: { HEADING: "Cormorant Garamond" },
            FontURLS: { HEADING: "https://cdn.example.com/heading.woff2" },
            FontViewURLS: {
              HEADING: "https://signed.example.com/heading.woff2",
            },
            FontViewURLSExpiresAt: "2026-03-01T12:05:00.000Z",
          },
        },
        Sections: [
          {
            Type: "MomentWall",
            Title: "Momentos de la boda",
            SectionID: "section-1",
            Order: "2",
            Config: '{"identifier":"boda-ana-luis","max_uploads_per_guest":12}',
          },
        ],
      },
    });

    expect(normalized).toEqual({
      meta: {
        pageTitle: "Boda Ana y Luis",
        footerVisible: false,
        eventId: "event-1",
        eventDateTime: "2026-08-15T20:30:00-06:00",
        coverImageUrl: "events/event-1/cover.webp",
        coverImageUrlExpiresAt: "2026-03-01T12:05:00.000Z",
        secondAddress: "Salon Principal",
        timezone: "America/Mexico_City",
        language: "es",
        contentVersion: "2026-07-08T03:15:00.000Z",
        access: {
          activeFrom: "2026-08-01T00:00:00-06:00",
          passwordProtected: true,
          accessVersion: "2026-07-07T21:15:00Z",
          previewAuthorized: true,
          passwordVerified: true,
        },
        theme: {
          designTemplateId: "template-1",
          designTemplateIdentifier: "classic-elegant",
          colorPaletteId: "palette-1",
          colorPaletteName: "Dorada",
          fontSetId: "fontset-1",
          fontSetName: "Editorial",
          colors: { primary: "#c8a45d" },
          fonts: { heading: "Cormorant Garamond" },
          fontUrls: { heading: "https://cdn.example.com/heading.woff2" },
          fontViewUrls: {
            heading: "https://signed.example.com/heading.woff2",
          },
          fontViewUrlsExpiresAt: "2026-03-01T12:05:00.000Z",
        },
      },
      sections: [
        {
          type: "MomentWall",
          title: "Momentos de la boda",
          sectionId: "section-1",
          order: 2,
          config: { identifier: "boda-ana-luis", max_uploads_per_guest: 12 },
        },
      ],
    });
  });

  it("falls back to PageSpec aliases when canonical envelope fields are null", () => {
    const normalized = readPageSpecPayload({
      Status: 200,
      Message: "Page spec loaded",
      data: null,
      Data: {
        meta: null,
        Meta: { PageTitle: "Boda Ana y Luis" },
        sections: null,
        Sections: [
          {
            type: null,
            Type: "MomentWall",
            sectionId: null,
            SectionID: "moments-section",
            order: null,
            Order: "2",
            config: null,
            Config: { Identifier: "boda-ana-luis" },
          },
        ],
      },
    });

    expect(normalized).toMatchObject({
      meta: { pageTitle: "Boda Ana y Luis" },
      sections: [
        {
          type: "MomentWall",
          sectionId: "moments-section",
          order: 2,
          config: { identifier: "boda-ana-luis" },
        },
      ],
    });
  });

  it("falls back to PageSpec aliases when canonical envelope fields are blank", () => {
    const normalized = readPageSpecPayload({
      Status: 200,
      Message: "Page spec loaded",
      data: " ",
      Data: {
        meta: " ",
        Meta: {
          pageTitle: " ",
          PageTitle: "Boda Ana y Luis",
          eventId: " ",
          EventID: "event-1",
          identifier: " ",
          Identifier: "boda-ana-luis",
          eventDateTime: " ",
          EventDateTime: "2026-08-15T20:30:00-06:00",
          footerVisible: " ",
          FooterVisible: false,
          access: " ",
          Access: { PasswordProtected: true },
        },
        sections: " ",
        Sections: [
          {
            type: " ",
            ComponentType: "RSVPConfirmation",
            sectionId: " ",
            SectionID: "rsvp-section",
            order: " ",
            SortOrder: "4",
            title: " ",
            SectionTitle: "Confirmacion",
            isVisible: " ",
            Visible: true,
            config: " ",
            ContentJSON: {
              DefaultWelcomeMessage: "Hola",
            },
          },
          {
            type: " ",
            ComponentType: "MomentWall",
            sectionId: " ",
            SectionID: "hidden-moments",
            isVisible: " ",
            Visible: false,
          },
        ],
      },
    });

    expect(normalized).toMatchObject({
      meta: {
        pageTitle: "Boda Ana y Luis",
        eventId: "event-1",
        identifier: "boda-ana-luis",
        eventDateTime: "2026-08-15T20:30:00-06:00",
        footerVisible: false,
        access: {
          passwordProtected: true,
        },
      },
      sections: [
        {
          type: "RSVPConfirmation",
          sectionId: "rsvp-section",
          order: 4,
          title: "Confirmacion",
          config: {
            welcome_message: "Hola",
          },
        },
      ],
    });
  });

  it("reads PageSpec metadata from alias envelopes when canonical data is blank", () => {
    const meta = readPageSpecMetaPayload({
      Status: 200,
      Message: "Page spec metadata loaded",
      data: " ",
      Data: {
        meta: " ",
        Meta: {
          pageTitle: " ",
          PageTitle: "Boda Ana y Luis",
          identifier: " ",
          Identifier: "boda-ana-luis",
        },
      },
    });

    expect(meta).toMatchObject({
      pageTitle: "Boda Ana y Luis",
      identifier: "boda-ana-luis",
    });
  });

  it("uses non-empty PageSpec section aliases before empty canonical section lists", () => {
    const normalized = readPageSpecPayload({
      Data: {
        Meta: { PageTitle: "Boda Ana y Luis" },
        sections: [],
        Sections: [
          {
            ComponentType: "MomentWall",
            SectionID: "moments-section",
            SortOrder: "2",
            ContentJSON: { Identifier: "boda-ana-luis" },
          },
        ],
      },
    });

    expect(normalized).toMatchObject({
      meta: { pageTitle: "Boda Ana y Luis" },
      sections: [
        {
          type: "MomentWall",
          sectionId: "moments-section",
          order: 2,
          config: { identifier: "boda-ana-luis" },
        },
      ],
    });
  });

  it("keeps partial access proofs and mixed Go event ID aliases", () => {
    const normalized = readPageSpecPayload({
      Data: {
        Meta: {
          PageTitle: "Evento privado",
          EventId: "event-1",
          Access: {
            PasswordVerified: "true",
          },
        },
        Sections: [],
      },
    });

    expect(normalized?.meta).toMatchObject({
      pageTitle: "Evento privado",
      eventId: "event-1",
      access: {
        passwordProtected: false,
        passwordVerified: true,
      },
    });
  });

  it("drops Go zero access dates from PageSpec payloads", () => {
    const normalized = readPageSpecPayload({
      Data: {
        Meta: {
          PageTitle: "Evento publico",
          Access: {
            ActiveFrom: "0001-01-01T00:00:00Z",
            ActiveUntil: "0001-01-01T00:00:00Z",
            PasswordProtected: false,
          },
        },
        Sections: [],
      },
    });

    expect(normalized?.meta.access).toEqual({
      passwordProtected: false,
    });
  });

  it("derives theme maps from dashboard design catalog objects", () => {
    const normalized = readPageSpecPayload({
      Data: {
        Meta: {
          PageTitle: "Preview de tema",
          Theme: {
            DesignTemplate: {
              ID: "template-2",
              Identifier: "modern-editorial",
              DefaultColorPaletteID: "palette-default",
              DefaultColorPalette: {
                Name: "Nocturna",
                Patterns: [
                  { Role: "PRIMARY", Color: { HexCode: "#111111" } },
                  { Key: "background-soft", Color: { Value: "#eeeeee" } },
                  { Role: "ACCENT", Color: { Value: " " } },
                ],
              },
              DefaultFontSetID: "fontset-default",
              DefaultFontSet: {
                Name: "Editorial",
                Patterns: [
                  {
                    Role: "HEADING",
                    Font: {
                      Family: "Playfair Display",
                      URL: "base/fonts/playfair.woff2",
                    },
                  },
                  {
                    Key: "body",
                    Font: { Name: "Inter", URL: " " },
                  },
                ],
              },
            },
          },
        },
        Sections: [],
      },
    });

    expect(normalized?.meta.theme).toEqual({
      designTemplateId: "template-2",
      designTemplateIdentifier: "modern-editorial",
      colorPaletteId: "palette-default",
      colorPaletteName: "Nocturna",
      fontSetId: "fontset-default",
      fontSetName: "Editorial",
      colors: {
        primary: "#111111",
        background_soft: "#eeeeee",
      },
      fonts: {
        heading: "Playfair Display",
        body: "Inter",
      },
      fontUrls: {
        heading: "base/fonts/playfair.woff2",
      },
    });
  });

  it("merges partial explicit theme maps over derived catalog maps", () => {
    const normalized = readPageSpecPayload({
      Data: {
        Meta: {
          PageTitle: "Preview de overrides",
          Theme: {
            Colors: { Primary: "#222222" },
            Fonts: { Heading: "Override Display" },
            FontUrls: { Heading: "base/fonts/override-heading.woff2" },
            FontViewUrls: {
              Heading: "https://signed.example.com/override-heading.woff2",
            },
            FontViewUrlsExpiresAt: "2026-03-01T12:10:00.000Z",
            ColorPalette: {
              Name: "Dorada",
              Patterns: [
                { Role: "PRIMARY", Color: { Value: "#c8a45d" } },
                { Key: "background-soft", Color: { Value: "#fff8ec" } },
              ],
            },
            FontSet: {
              Name: "Editorial",
              Patterns: [
                {
                  Role: "HEADING",
                  Font: {
                    Family: "Playfair Display",
                    URL: "base/fonts/playfair.woff2",
                    ViewURL: "https://signed.example.com/playfair.woff2",
                    ViewURLExpiresAt: "2026-03-01T12:05:00.000Z",
                  },
                },
                {
                  Key: "body",
                  Font: {
                    Name: "Inter",
                    URL: "base/fonts/inter.woff2",
                  },
                },
              ],
            },
          },
        },
        Sections: [],
      },
    });

    expect(normalized?.meta.theme).toMatchObject({
      colorPaletteName: "Dorada",
      fontSetName: "Editorial",
      colors: {
        primary: "#222222",
        background_soft: "#fff8ec",
      },
      fonts: {
        heading: "Override Display",
        body: "Inter",
      },
      fontUrls: {
        heading: "base/fonts/override-heading.woff2",
        body: "base/fonts/inter.woff2",
      },
      fontViewUrls: {
        heading: "https://signed.example.com/override-heading.woff2",
      },
      fontViewUrlsExpiresAt: "2026-03-01T12:05:00.000Z",
    });
  });

  it("derives raw and signed font URLs from catalog font objects", () => {
    const normalized = readPageSpecPayload({
      Data: {
        Meta: {
          PageTitle: "Preview de fuentes",
          Theme: {
            FontSet: {
              ID: "fontset-1",
              Name: "Editorial",
              Patterns: [
                {
                  Role: "HEADING",
                  Font: {
                    Family: "Playfair Display",
                    URL: "base/fonts/playfair.woff2",
                    ViewURL: "https://signed.example.com/playfair.woff2",
                    ViewURLExpiresAt: "2026-03-01T12:05:00.000Z",
                  },
                },
                {
                  Key: "body",
                  Font: {
                    Name: "Inter",
                    Resource: { Path: "base/fonts/inter.woff2" },
                  },
                },
                {
                  Key: "accent",
                  Font: {
                    Family: "Lora",
                    Resource: { ObjectKey: "base/fonts/lora-object.woff2" },
                  },
                },
                {
                  Key: "caption",
                  Font: {
                    Family: "Montserrat",
                    Resource: { s3_key: "base/fonts/montserrat-s3.woff2" },
                  },
                },
              ],
            },
          },
        },
        Sections: [],
      },
    });

    expect(normalized?.meta.theme).toMatchObject({
      fontSetId: "fontset-1",
      fontSetName: "Editorial",
      fonts: {
        heading: "Playfair Display",
        body: "Inter",
        accent: "Lora",
        caption: "Montserrat",
      },
      fontUrls: {
        heading: "base/fonts/playfair.woff2",
        body: "base/fonts/inter.woff2",
        accent: "base/fonts/lora-object.woff2",
        caption: "base/fonts/montserrat-s3.woff2",
      },
      fontViewUrls: {
        heading: "https://signed.example.com/playfair.woff2",
      },
      fontViewUrlsExpiresAt: "2026-03-01T12:05:00.000Z",
    });
  });

  it("preserves signed cover aliases separately when PageSpec coverImageUrl is blank", () => {
    const normalized = readPageSpecPayload({
      Status: 200,
      Data: {
        Meta: {
          PageTitle: "Evento firmado",
          CoverImageURL: " ",
          CoverViewURL: "https://signed.example.com/cover.webp",
          CoverViewURLExpiresAt: "2026-03-01T12:05:00.000Z",
        },
        Sections: [],
      },
    });

    expect(normalized?.meta).toMatchObject({
      pageTitle: "Evento firmado",
      coverViewUrl: "https://signed.example.com/cover.webp",
      coverViewUrlExpiresAt: "2026-03-01T12:05:00.000Z",
    });
    expect(getPageSpecCoverExpiry(normalized!)?.toISOString()).toBe(
      "2026-03-01T12:05:00.000Z",
    );
  });

  it("normalizes cached section configs when reading and writing", () => {
    const storage = new MemoryStorage();
    const legacySpec = {
      meta: { pageTitle: "Evento", footerVisible: true },
      sections: [
        {
          type: "HERO",
          sectionId: "hero",
          order: 1,
          config: '{"title":"Hola"}',
        },
      ],
    } as unknown as PageSpec;

    writePageSpecCache("mi-evento", legacySpec, "identifier", storage, 1_000);

    expect(
      readPageSpecCache("mi-evento", "identifier", storage, 1_001)?.sections[0]
        ?.config,
    ).toEqual({
      title: "Hola",
    });
    expect(
      storage.getItem(pageSpecCacheKey("mi-evento", "identifier")),
    ).toContain('"config":{"title":"Hola"}');
  });
});
