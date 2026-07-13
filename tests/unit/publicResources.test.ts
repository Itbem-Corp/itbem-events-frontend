import { describe, expect, it } from "vitest";
import {
  normalizeSectionResource,
  normalizeSectionResourcesPayload,
  resourceAtPosition,
  sortSectionResources,
  type SectionResource,
} from "../../src/lib/publicResources";

describe("publicResources", () => {
  it("sorts section resources by backend position", () => {
    const resources: SectionResource[] = [
      {
        title: "Tres",
        position: 3,
        view_url: "https://cdn.example.com/3.webp",
      },
      { title: "Uno", position: 1, view_url: "https://cdn.example.com/1.webp" },
      { title: "Dos", position: 2, view_url: "https://cdn.example.com/2.webp" },
    ];

    expect(
      sortSectionResources(resources).map((resource) => resource.title),
    ).toEqual(["Uno", "Dos", "Tres"]);
    expect(resources.map((resource) => resource.title)).toEqual([
      "Tres",
      "Uno",
      "Dos",
    ]);
  });

  it("uses resource id as a stable tie-break when positions match", () => {
    const resources: SectionResource[] = [
      {
        id: "res-c",
        title: "C",
        position: 2,
        view_url: "https://cdn.example.com/c.webp",
      },
      {
        id: "res-b",
        title: "B",
        position: 1,
        view_url: "https://cdn.example.com/b.webp",
      },
      {
        id: "res-a",
        title: "A",
        position: 1,
        view_url: "https://cdn.example.com/a.webp",
      },
    ];

    expect(sortSectionResources(resources).map((resource) => resource.id)).toEqual([
      "res-a",
      "res-b",
      "res-c",
    ]);
  });

  it("reads resources by explicit backend position instead of array index", () => {
    const resources: SectionResource[] = [
      {
        title: "Confirmado",
        position: 1,
        view_url: "https://cdn.example.com/yes.webp",
      },
    ];

    expect(resourceAtPosition(resources, 0)).toBeUndefined();
    expect(resourceAtPosition(resources, 1)?.title).toBe("Confirmado");
  });

  it("uses fallback resource position for blank position aliases", () => {
    const section = normalizeSectionResourcesPayload(
      {
        sectionResources: [
          {
            title: "Cero",
            position: 0,
            viewUrl: "https://cdn.example.com/0.webp",
          },
          {
            title: "Uno",
            position: 1,
            viewUrl: "https://cdn.example.com/1.webp",
          },
          {
            title: "Fallback",
            sortOrder: " ",
            viewUrl: "https://cdn.example.com/2.webp",
          },
        ],
      },
      "section-1",
      "https://api.example.com",
    );

    expect(
      section.sectionResources.map((resource) => [
        resource.title,
        resource.position,
      ]),
    ).toEqual([
      ["Cero", 0],
      ["Uno", 1],
      ["Fallback", 2],
    ]);
  });

  it("skips blank canonical fields before reading backend aliases", () => {
    expect(
      normalizeSectionResource(
        {
          id: " ",
          ID: "resource-1",
          event_section_id: " ",
          EventSectionID: "section-1",
          resource_type_id: " ",
          ResourceTypeID: "image-type",
          title: " ",
          Title: "Hero",
          alt_text: " ",
          AltText: "Hero alt",
          position: " ",
          SortOrder: "3",
          view_url: " ",
          ViewURL: "events/hero.webp",
          view_url_expires_at: " ",
          ViewURLExpiresAt: "2026-03-01T12:05:00.000Z",
          created_at: " ",
          CreatedAt: "2026-03-01T12:00:00.000Z",
        },
        "https://api.example.com/api",
      ),
    ).toEqual(
      expect.objectContaining({
        id: "resource-1",
        event_section_id: "section-1",
        resource_type_id: "image-type",
        title: "Hero",
        alt_text: "Hero alt",
        position: 3,
        view_url: "https://api.example.com/storage/events/hero.webp",
        view_url_expires_at: "2026-03-01T12:05:00.000Z",
        created_at: "2026-03-01T12:00:00.000Z",
      }),
    );
  });

  it("normalizes url aliases and raw backend keys into view_url", () => {
    expect(
      normalizeSectionResource(
        {
          title: "Hero",
          position: "2",
          url: "events/hero.webp",
        },
        "https://api.example.com/api",
      ),
    ).toEqual({
      id: undefined,
      event_section_id: undefined,
      resource_type_id: undefined,
      alt_text: undefined,
      title: "Hero",
      position: 2,
      url: "https://api.example.com/storage/events/hero.webp",
      view_url: "https://api.example.com/storage/events/hero.webp",
      view_url_expires_at: undefined,
      created_at: undefined,
    });
  });

  it("normalizes object-key aliases into public resource media URLs", () => {
    expect(
      normalizeSectionResource(
        {
          Id: "resource-1",
          title: "Hero",
          objectKey: "events/object-hero.webp",
        },
        "https://api.example.com/api",
      ),
    ).toEqual(
      expect.objectContaining({
        id: "resource-1",
        view_url: "https://api.example.com/storage/events/object-hero.webp",
      }),
    );

    expect(
      normalizeSectionResource(
        {
          title: "Logo",
          S3Key: "events/logo.webp",
        },
        "https://api.example.com/api",
      )?.view_url,
    ).toBe("https://api.example.com/storage/events/logo.webp");
  });

  it("keeps absolute URL-like resource media unchanged", () => {
    expect(
      normalizeSectionResource(
        {
          title: "External",
          view_url: "//cdn.example.com/events/hero.webp",
        },
        "https://api.example.com/api",
      )?.view_url,
    ).toBe("//cdn.example.com/events/hero.webp");

    expect(
      normalizeSectionResource(
        {
          title: "Inline",
          view_url: "data:image/webp;base64,AAAA",
        },
        "https://api.example.com/api",
      )?.view_url,
    ).toBe("data:image/webp;base64,AAAA");
  });

  it("normalizes view URL expiry aliases for cache freshness", () => {
    const explicitDate = new Date("2026-03-01T12:03:00.000Z");

    expect(
      normalizeSectionResource(
        {
          title: "Hero",
          view_url: "https://cdn.example.com/hero.webp",
          viewURLExpiresAt: "2026-03-01T12:02:00.000Z",
        },
        "https://api.example.com",
      )?.view_url_expires_at,
    ).toBe("2026-03-01T12:02:00.000Z");

    expect(
      normalizeSectionResource(
        {
          title: "Hero",
          view_url: "https://cdn.example.com/hero.webp",
          expiresAt: explicitDate,
        },
        "https://api.example.com",
      )?.view_url_expires_at,
    ).toBe("2026-03-01T12:03:00.000Z");
  });

  it("normalizes cached section resource payloads before rendering", () => {
    const section = normalizeSectionResourcesPayload(
      {
        sectionResources: [
          {
            title: "Dos",
            position: 2,
            viewUrl: "https://cdn.example.com/2.webp",
          },
          { title: "Uno", position: 1, view_url: "events/1.webp" },
          { title: "Sin URL", position: 0 },
        ],
      },
      "section-1",
      "https://api.example.com",
    );

    expect(section.sectionId).toBe("section-1");
    expect(section.sectionResources.map((resource) => resource.title)).toEqual([
      "Uno",
      "Dos",
    ]);
    expect(section.sectionResources[0]?.view_url).toBe(
      "https://api.example.com/storage/events/1.webp",
    );
  });

  it("normalizes backend envelopes and paginated aliases before rendering", () => {
    const section = normalizeSectionResourcesPayload(
      {
        status: 200,
        message: "Resources loaded",
        data: {
          items: [
            {
              Title: "Legacy Hero",
              Position: "2",
              ViewURL: "events/legacy-hero.webp",
            },
            {
              title: "Cover",
              position: 1,
              view_url: "https://cdn.example.com/cover.webp",
            },
          ],
        },
      },
      "section-2",
      "https://api.example.com/api",
    );

    expect(section.sectionResources.map((resource) => resource.title)).toEqual([
      "Cover",
      "Legacy Hero",
    ]);
    expect(section.sectionResources[1]?.view_url).toBe(
      "https://api.example.com/storage/events/legacy-hero.webp",
    );
  });

  it("accepts mixed acronym aliases from adapters", () => {
    const section = normalizeSectionResourcesPayload(
      {
        data: [
          {
            ID: "resource-1",
            EventSectionId: "section-4",
            ResourceTypeId: "resource-type-1",
            Title: "Logo",
            ViewUrl: "events/logo.webp",
            ViewUrlExpiresAt: "2026-03-01T12:05:00.000Z",
            sortOrder: "2",
          },
          {
            id: "resource-2",
            eventSectionID: "section-4",
            resourceTypeID: "resource-type-2",
            title: "Portada",
            viewURL: "events/cover.webp",
            order: "1",
          },
        ],
      },
      "section-4",
      "https://api.example.com/api",
    );

    expect(section.sectionResources).toEqual([
      expect.objectContaining({
        id: "resource-2",
        event_section_id: "section-4",
        resource_type_id: "resource-type-2",
        title: "Portada",
        position: 1,
        view_url: "https://api.example.com/storage/events/cover.webp",
      }),
      expect.objectContaining({
        id: "resource-1",
        event_section_id: "section-4",
        resource_type_id: "resource-type-1",
        title: "Logo",
        position: 2,
        view_url: "https://api.example.com/storage/events/logo.webp",
        view_url_expires_at: "2026-03-01T12:05:00.000Z",
      }),
    ]);
  });

  it("normalizes Pascal-cased adapter envelopes before rendering", () => {
    const section = normalizeSectionResourcesPayload(
      {
        Status: 200,
        Message: "Resources loaded",
        Data: {
          Items: [
            {
              Title: "Cover",
              Position: "1",
              ViewURL: "events/base/hero/cover.webp",
              ViewURLExpiresAt: "2026-03-01T12:05:00.000Z",
            },
          ],
          Total: 1,
        },
      },
      "section-3",
      "https://api.example.com/api",
    );

    expect(section).toEqual({
      sectionId: "section-3",
      sectionResources: [
        expect.objectContaining({
          title: "Cover",
          position: 1,
          view_url:
            "https://api.example.com/storage/events/base/hero/cover.webp",
          view_url_expires_at: "2026-03-01T12:05:00.000Z",
        }),
      ],
    });
  });

  it("uses non-empty resource list aliases before empty canonical list aliases", () => {
    const section = normalizeSectionResourcesPayload(
      {
        Status: 200,
        Message: "Resources loaded",
        data: [],
        Data: {
          Items: [
            {
              Title: "Cover",
              Position: "1",
              ViewURL: "events/base/hero/cover.webp",
            },
          ],
          Total: 1,
        },
      },
      "section-5",
      "https://api.example.com/api",
    );

    expect(section.sectionResources).toEqual([
      expect.objectContaining({
        title: "Cover",
        position: 1,
        view_url: "https://api.example.com/storage/events/base/hero/cover.webp",
      }),
    ]);

    const objectPage = normalizeSectionResourcesPayload(
      {
        Status: 200,
        Message: "Resources loaded",
        data: { items: [] },
        Data: {
          Items: [
            {
              Title: "Gallery",
              Position: "2",
              ViewURL: "events/base/gallery.webp",
            },
          ],
          Total: 1,
        },
      },
      "section-6",
      "https://api.example.com/api",
    );

    expect(objectPage.sectionResources).toEqual([
      expect.objectContaining({
        title: "Gallery",
        position: 2,
        view_url: "https://api.example.com/storage/events/base/gallery.webp",
      }),
    ]);

    const resourcesAliasPage = normalizeSectionResourcesPayload(
      {
        Status: 200,
        Message: "Resources loaded",
        data: { resources: [] },
        Data: {
          Resources: [
            {
              Title: "Logo",
              Position: "3",
              ViewURL: "events/base/logo.webp",
            },
          ],
          Total: 1,
        },
      },
      "section-7",
      "https://api.example.com/api",
    );

    expect(resourcesAliasPage.sectionResources).toEqual([
      expect.objectContaining({
        title: "Logo",
        position: 3,
        view_url: "https://api.example.com/storage/events/base/logo.webp",
      }),
    ]);
  });
});
