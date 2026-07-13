import { describe, expect, it } from "vitest";
import {
  getPublicAttendeesCacheExpiresAt,
  getPublicAttendeesRefreshDelay,
  getPublicAttendeeImageExpiry,
  getPublicAttendeeName,
  hasPublicAttendeeDetails,
  normalizePublicAttendee,
  normalizePublicAttendeesPayload,
  publicAttendeesMediaRefreshKey,
  publicAttendeeImageUrl,
  type PublicAttendee,
} from "../../src/lib/publicAttendees";

function presignedUrl(path: string, date: string, expires: number): string {
  return `https://cdn.example.com/${path}?X-Amz-Date=${date}&X-Amz-Expires=${expires}&X-Amz-Signature=test`;
}

describe("publicAttendees", () => {
  it("builds display names from nickname or first/last name", () => {
    expect(
      getPublicAttendeeName({
        first_name: "Ana",
        last_name: "Garcia",
        nickname: "Anita",
        order: 1,
      }),
    ).toBe("Anita");

    expect(
      getPublicAttendeeName({
        first_name: "Luis",
        last_name: "Perez",
        order: 2,
      }),
    ).toBe("Luis Perez");
  });

  it("detects optional public profile fields", () => {
    const base: PublicAttendee = {
      first_name: "Ana",
      last_name: "Garcia",
      order: 1,
    };

    expect(hasPublicAttendeeDetails(base)).toBe(false);
    expect(
      hasPublicAttendeeDetails({
        ...base,
        image_view_url: "https://signed.example.com/ana.webp",
      }),
    ).toBe(true);
    expect(
      hasPublicAttendeeDetails({ ...base, image_url: "profiles/ana.webp" }),
    ).toBe(true);
    expect(hasPublicAttendeeDetails({ ...base, headline: "Ingenieria" })).toBe(
      true,
    );
    expect(hasPublicAttendeeDetails({ ...base, bio: "Bio publica" })).toBe(
      true,
    );
    expect(hasPublicAttendeeDetails({ ...base, signature: "Gracias" })).toBe(
      true,
    );
  });

  it("normalizes public attendee payloads across casing variants", () => {
    expect(
      normalizePublicAttendeesPayload({
        data: {
          items: [
            {
              FirstName: " Ana ",
              LastName: "Garcia",
              Nickname: "Anita",
              Order: "3",
              ImageURL: "profiles/ana.webp",
              Headline: "Ingenieria",
              Bio: "Bio publica",
              Signature: "Gracias",
            },
          ],
        },
      }),
    ).toEqual([
      {
        first_name: "Ana",
        last_name: "Garcia",
        nickname: "Anita",
        role: undefined,
        order: 3,
        image_url: "profiles/ana.webp",
        image_view_url: "profiles/ana.webp",
        image_view_url_expires_at: undefined,
        headline: "Ingenieria",
        bio: "Bio publica",
        signature: "Gracias",
      },
    ]);
  });

  it("uses non-empty attendee list aliases before empty canonical aliases", () => {
    expect(
      normalizePublicAttendeesPayload({
        data: {
          items: [],
          Items: [{ FirstName: "Ana", LastName: "Garcia" }],
        },
      }).map((attendee) => attendee.first_name),
    ).toEqual(["Ana"]);

    expect(
      normalizePublicAttendeesPayload({
        data: {},
        Data: {
          items: [],
          Items: [{ FirstName: "Luis", LastName: "Perez" }],
        },
      }).map((attendee) => attendee.first_name),
    ).toEqual(["Luis"]);

    expect(
      normalizePublicAttendeesPayload({
        Status: 200,
        Message: "Attendees loaded",
        data: { items: [] },
        Data: {
          Items: [{ FirstName: "Mar", LastName: "Lopez" }],
          Total: 1,
        },
      }).map((attendee) => attendee.first_name),
    ).toEqual(["Mar"]);
  });

  it("falls back to later attendee aliases when canonical fields are null", () => {
    expect(
      normalizePublicAttendee({
        first_name: null,
        FirstName: "Ana",
        last_name: undefined,
        LastName: "Garcia",
        role: null,
        Role: "graduate",
        order: null,
        Order: "3",
        headline: null,
        Headline: "Ingenieria",
      }),
    ).toMatchObject({
      first_name: "Ana",
      last_name: "Garcia",
      role: "graduate",
      order: 3,
      headline: "Ingenieria",
    });
  });

  it("falls back to later attendee aliases when canonical fields are blank", () => {
    expect(
      normalizePublicAttendee(
        {
          first_name: " ",
          FirstName: "Ana",
          last_name: " ",
          LastName: "Garcia",
          role: " ",
          Role: "graduate",
          order: " ",
          SortOrder: "3",
          image_url: " ",
          ImageURL: "profiles/ana.webp",
          image_view_url: " ",
          ImageViewURL: "https://signed.example.com/ana.webp",
          image_view_url_expires_at: " ",
          ImageViewURLExpiresAt: "2026-03-01T12:05:00.000Z",
          headline: " ",
          Headline: "Ingenieria",
          bio: " ",
          Bio: "Bio publica",
          signature: " ",
          Signature: "Gracias",
        },
        0,
        "https://api.example.com/api",
      ),
    ).toMatchObject({
      first_name: "Ana",
      last_name: "Garcia",
      role: "graduate",
      order: 3,
      image_url: "https://api.example.com/storage/profiles/ana.webp",
      image_view_url: "https://signed.example.com/ana.webp",
      image_view_url_expires_at: "2026-03-01T12:05:00.000Z",
      headline: "Ingenieria",
      bio: "Bio publica",
      signature: "Gracias",
    });
  });

  it("keeps raw and signed public attendee image URLs separated", () => {
    const attendees = normalizePublicAttendeesPayload({
      data: {
        items: [
          {
            FirstName: "Ana",
            ImageURL: "profiles/ana.webp",
            ImageViewURL: "https://signed.example.com/ana.webp",
            ImageViewURLExpiresAt: "2026-03-01T12:05:00.000Z",
          },
          {
            FirstName: "Luis",
            ProfileImageURL: "profiles/luis.webp",
          },
          {
            FirstName: "Mar",
            avatarUrl: "profiles/mar.webp",
          },
        ],
      },
    });

    expect(attendees.map((attendee) => attendee.image_url)).toEqual([
      "profiles/ana.webp",
      "profiles/luis.webp",
      "profiles/mar.webp",
    ]);
    expect(attendees[0]).toMatchObject({
      image_view_url: "https://signed.example.com/ana.webp",
      image_view_url_expires_at: "2026-03-01T12:05:00.000Z",
    });
    expect(publicAttendeeImageUrl(attendees[0])).toBe(
      "https://signed.example.com/ana.webp",
    );
  });

  it("resolves public attendee image paths when an events URL is provided", () => {
    const attendees = normalizePublicAttendeesPayload(
      {
        data: {
          items: [
            {
              FirstName: "Ana",
              ImageURL: "profiles/ana.webp",
              ImageViewURL: "https://signed.example.com/ana.webp",
            },
            {
              FirstName: "Luis",
              ImageURL: "storage/profiles/luis.webp",
            },
          ],
        },
      },
      "https://api.example.com/api",
    );

    expect(attendees[0]).toMatchObject({
      image_url: "https://api.example.com/storage/profiles/ana.webp",
      image_view_url: "https://signed.example.com/ana.webp",
    });
    expect(attendees[1]).toMatchObject({
      image_url: "https://api.example.com/storage/profiles/luis.webp",
      image_view_url: "https://api.example.com/storage/profiles/luis.webp",
    });
  });

  it("prefers image_view_url for display and cache expiry", () => {
    const attendee = normalizePublicAttendee({
      firstName: "Ana",
      image_url: "profiles/ana.webp",
      image_view_url: "https://signed.example.com/ana.webp",
      image_view_url_expires_at: "2026-03-01T12:05:00.000Z",
    });

    expect(attendee).not.toBeNull();
    expect(publicAttendeeImageUrl(attendee!)).toBe(
      "https://signed.example.com/ana.webp",
    );
    expect(getPublicAttendeeImageExpiry(attendee!)?.toISOString()).toBe(
      "2026-03-01T12:05:00.000Z",
    );
  });

  it("expires cached attendees before signed image URLs expire", () => {
    const cachedAt = Date.parse("2026-03-01T12:00:00.000Z");
    const attendee = normalizePublicAttendee({
      firstName: "Ana",
      image_view_url: presignedUrl("ana.webp", "20260301T120000Z", 120),
    });

    expect(attendee).not.toBeNull();
    expect(
      getPublicAttendeesCacheExpiresAt([attendee!], cachedAt, 5 * 60 * 1000),
    ).toBe(Date.parse("2026-03-01T12:01:00.000Z"));
  });

  it("refreshes mounted attendee lists before signed image URLs expire", () => {
    const now = Date.parse("2026-03-01T12:00:00.000Z");
    const attendees = normalizePublicAttendeesPayload([
      {
        firstName: "Ana",
        image_view_url: presignedUrl("ana.webp", "20260301T120000Z", 180),
      },
      {
        firstName: "Luis",
        image_view_url: "https://signed.example.com/luis.webp",
        image_view_url_expires_at: "2026-03-01T12:05:00.000Z",
      },
    ]);

    expect(getPublicAttendeesRefreshDelay(attendees, now, 60_000)).toBe(
      120_000,
    );
    expect(publicAttendeesMediaRefreshKey(attendees)).toContain("ana.webp");
    expect(publicAttendeesMediaRefreshKey(attendees)).toContain(
      "2026-03-01T12:05:00.000Z",
    );
  });

  it("does not schedule attendee media refresh for unsigned images", () => {
    expect(
      getPublicAttendeesRefreshDelay([
        {
          first_name: "Ana",
          last_name: "Garcia",
          order: 1,
          image_view_url: "profiles/ana.webp",
        },
      ]),
    ).toBeNull();
  });

  it("drops malformed attendees and uses index as fallback order", () => {
    expect(
      normalizePublicAttendeesPayload([
        { role: "missing name" },
        { firstName: "Luis", lastName: "Perez" },
      ]),
    ).toEqual([
      {
        first_name: "Luis",
        last_name: "Perez",
        nickname: undefined,
        role: undefined,
        order: 1,
        image_url: undefined,
        image_view_url: undefined,
        image_view_url_expires_at: undefined,
        headline: undefined,
        bio: undefined,
        signature: undefined,
      },
    ]);
  });

  it("sorts attendees by public order while preserving equal-order payload order", () => {
    expect(
      normalizePublicAttendeesPayload([
        { firstName: "Carlos", order: 3 },
        { firstName: "Ana", order: "1" },
        { firstName: "Luis", order: 1 },
        { firstName: "Valeria", order: 2 },
      ]).map((attendee) => attendee.first_name),
    ).toEqual(["Ana", "Luis", "Valeria", "Carlos"]);
  });

  it("reads backend public display order aliases", () => {
    expect(
      normalizePublicAttendeesPayload([
        { firstName: "Carlos", display_order: "3" },
        { firstName: "Ana", publicOrder: 1 },
        { firstName: "Luis", DisplayOrder: 2 },
        { firstName: "Valeria", sortOrder: 4 },
      ]).map((attendee) => [attendee.first_name, attendee.order]),
    ).toEqual([
      ["Ana", 1],
      ["Luis", 2],
      ["Carlos", 3],
      ["Valeria", 4],
    ]);
  });

  it("uses fallback order for blank order aliases", () => {
    expect(
      normalizePublicAttendeesPayload([
        { firstName: "Ana", order: 0 },
        { firstName: "Luis", order: 1 },
        { firstName: "Valeria", order: " " },
      ]).map((attendee) => [attendee.first_name, attendee.order]),
    ).toEqual([
      ["Ana", 0],
      ["Luis", 1],
      ["Valeria", 2],
    ]);
  });

  it("normalizes a single attendee or rejects non-objects", () => {
    expect(normalizePublicAttendee(null)).toBeNull();
    expect(
      normalizePublicAttendee({ Nickname: "Generacion 2026" }),
    ).toMatchObject({
      first_name: "",
      last_name: "",
      nickname: "Generacion 2026",
      order: 0,
    });
    expect(
      normalizePublicAttendee({
        firstName: "Luis",
        imageURL: "profiles/luis.webp",
      }),
    ).toMatchObject({
      first_name: "Luis",
      image_url: "profiles/luis.webp",
    });
  });
});
