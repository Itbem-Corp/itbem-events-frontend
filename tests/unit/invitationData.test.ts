import { describe, expect, it } from "vitest";
import {
  buildRsvpConfirmationRequest,
  mergeInvitationPayload,
  normalizeInvitationPayload,
} from "../../src/lib/invitationData";

describe("normalizeInvitationPayload", () => {
  it("normalizes the backend public invitation lookup payload", () => {
    const data = normalizeInvitationPayload({
      data: {
        pretty_token: "ABC-123",
        event: {
          name: "Boda Ana y Luis",
          event_date_time: "2026-08-15T20:30:00-06:00",
          timezone: "America/Mexico_City",
        },
        invitation: {
          id: "inv-1",
          event_id: "evt-1",
          max_guests: 4,
        },
        guest: {
          first_name: "Ana",
          last_name: "Garcia",
          rsvp_status: "confirmed",
          rsvp_at: "2026-07-01T18:45:00Z",
          rsvp_method: "web",
          dietary_restrictions: "vegano",
          rsvp_notes: "Mesa cerca",
        },
      },
    });

    expect(data).toEqual({
      id: "inv-1",
      eventId: "evt-1",
      guestName: "Ana Garcia",
      maxGuests: 4,
      prettyToken: "ABC-123",
      rsvpStatus: "confirmed",
      rsvpAt: "2026-07-01T18:45:00Z",
      rsvpMethod: "web",
      dietaryRestrictions: "vegano",
      rsvpNotes: "Mesa cerca",
      eventName: "Boda Ana y Luis",
      eventDate: "2026-08-15T20:30:00-06:00",
      eventTimezone: "America/Mexico_City",
    });
  });

  it("keeps compatibility with legacy Go field names", () => {
    const data = normalizeInvitationPayload({
      data: {
        PrettyToken: "LEGACY-1",
        invitation: {
          ID: "inv-old",
          EventID: "evt-old",
          MaxGuests: 2,
          Event: {
            Name: "Evento Legacy",
            EventDateTime: "2026-09-01T12:00:00-06:00",
            TimeZone: "America/Chicago",
          },
        },
        guest: {
          FirstName: "Luis",
          LastName: "Lopez",
          RSVPStatus: "declined",
          RSVPAt: "2026-07-02T12:00:00Z",
          RSVPMethod: "host",
        },
      },
    });

    expect(data).toMatchObject({
      id: "inv-old",
      eventId: "evt-old",
      guestName: "Luis Lopez",
      maxGuests: 2,
      prettyToken: "LEGACY-1",
      rsvpStatus: "declined",
      rsvpAt: "2026-07-02T12:00:00Z",
      rsvpMethod: "host",
      eventName: "Evento Legacy",
      eventDate: "2026-09-01T12:00:00-06:00",
      eventTimezone: "America/Chicago",
    });
  });

  it("normalizes Pascal-cased API envelopes from the backend adapters", () => {
    const data = normalizeInvitationPayload({
      Status: 200,
      Message: "Invitation loaded",
      Data: {
        PrettyToken: "NICE-123",
        Event: {
          Name: "Boda Pascal",
          EventDateTime: "2026-08-15T20:30:00-06:00",
          Timezone: "America/Mexico_City",
        },
        Invitation: {
          ID: "inv-pascal",
          EventID: "evt-pascal",
          MaxGuests: 5,
        },
        Guest: {
          FirstName: "Ana",
          LastName: "Garcia",
          RSVPStatus: "pending",
          RSVPGuestCount: 1,
        },
      },
    });

    expect(data).toEqual({
      id: "inv-pascal",
      eventId: "evt-pascal",
      guestName: "Ana Garcia",
      maxGuests: 5,
      prettyToken: "NICE-123",
      rsvpStatus: "pending",
      rsvpGuestCount: 1,
      eventName: "Boda Pascal",
      eventDate: "2026-08-15T20:30:00-06:00",
      eventTimezone: "America/Mexico_City",
    });
  });

  it("uses useful Data aliases before blank or empty canonical envelope data", () => {
    expect(
      normalizeInvitationPayload({
        Status: 200,
        Message: "Invitation loaded",
        data: " ",
        Data: {
          PrettyToken: "NICE-123",
          Event: {
            Name: "Boda Pascal",
            EventDateTime: "2026-08-15T20:30:00-06:00",
          },
          Invitation: {
            ID: "inv-pascal",
            EventID: "evt-pascal",
            MaxGuests: 5,
          },
          Guest: {
            FirstName: "Ana",
            LastName: "Garcia",
            RSVPStatus: "pending",
          },
        },
      }),
    ).toMatchObject({
      id: "inv-pascal",
      eventId: "evt-pascal",
      guestName: "Ana Garcia",
      maxGuests: 5,
      prettyToken: "NICE-123",
      rsvpStatus: "pending",
      eventName: "Boda Pascal",
      eventDate: "2026-08-15T20:30:00-06:00",
    });

    expect(
      normalizeInvitationPayload({
        Status: 200,
        Message: "Invitation loaded",
        data: [],
        Data: {
          Guest: {
            FirstName: "Luis",
            RSVPStatus: "confirmed",
          },
        },
      }).guestName,
    ).toBe("Luis");
  });

  it("uses non-empty nested aliases before empty invitation records", () => {
    const data = normalizeInvitationPayload({
      data: {
        invitation: {},
        Invitation: {
          ID: "inv-pascal",
          EventID: "evt-pascal",
          MaxGuests: 3,
          Event: {
            Name: "Evento desde invitacion",
            EventDateTime: "2026-09-10T19:00:00-06:00",
          },
        },
        guest: {},
        Guest: {
          FirstName: "Ana",
          LastName: "Lopez",
          RSVPStatus: "confirmed",
        },
        event: {},
      },
    });

    expect(data).toMatchObject({
      id: "inv-pascal",
      eventId: "evt-pascal",
      guestName: "Ana Lopez",
      maxGuests: 3,
      rsvpStatus: "confirmed",
      eventName: "Evento desde invitacion",
      eventDate: "2026-09-10T19:00:00-06:00",
    });
  });

  it("normalizes token and event fallbacks from nested records", () => {
    const data = normalizeInvitationPayload({
      data: {
        id: "inv-flat",
        EventID: "evt-flat",
        eventName: "Evento Flat",
        event_date_time: "2026-10-20T18:00:00-06:00",
        Invitation: {
          prettyToken: "INV-TOKEN",
        },
        Guest: {
          first_name: "Mar",
          last_name: "Rios",
          MaxGuests: 3,
          RSVPStatus: "pending",
        },
      },
    });

    expect(data).toEqual({
      id: "inv-flat",
      eventId: "evt-flat",
      guestName: "Mar Rios",
      maxGuests: 3,
      prettyToken: "INV-TOKEN",
      rsvpStatus: "pending",
      eventName: "Evento Flat",
      eventDate: "2026-10-20T18:00:00-06:00",
    });
  });

  it("accepts public event_date aliases used by other backend public payloads", () => {
    expect(
      normalizeInvitationPayload({
        data: {
          event: {
            name: "Evento Publico",
            event_date: "2026-11-20T19:30:00-06:00",
          },
        },
      }),
    ).toMatchObject({
      eventName: "Evento Publico",
      eventDate: "2026-11-20T19:30:00-06:00",
    });

    expect(
      normalizeInvitationPayload({
        Data: {
          Invitation: {
            EventDate: "2026-12-05T18:00:00-06:00",
          },
        },
      }).eventDate,
    ).toBe("2026-12-05T18:00:00-06:00");
  });

  it("accepts flattened max guest aliases from adapter payloads", () => {
    expect(
      normalizeInvitationPayload({
        data: {
          max_guests: "6",
        },
      }).maxGuests,
    ).toBe(6);

    expect(
      normalizeInvitationPayload({
        Data: {
          MaxGuests: 3,
        },
      }).maxGuests,
    ).toBe(3);
  });

  it("normalizes event identifier aliases used by public RSVP links", () => {
    expect(
      normalizeInvitationPayload({
        data: {
          event: {
            identifier: "boda-ana-luis",
          },
        },
      }).eventIdentifier,
    ).toBe("boda-ana-luis");

    expect(
      normalizeInvitationPayload({
        Data: {
          Invitation: {
            EventIdentifier: "evento-pascal",
          },
        },
      }).eventIdentifier,
    ).toBe("evento-pascal");
  });

  it("skips blank strings before applying invitation token fallbacks", () => {
    const data = normalizeInvitationPayload({
      data: {
        pretty_token: "   ",
        invitation: {
          prettyToken: " ",
        },
        guest: {
          first_name: " Ana ",
          last_name: " Garcia ",
          pretty_token: " TOKEN-123 ",
        },
      },
    });

    expect(data).toMatchObject({
      guestName: "Ana Garcia",
      prettyToken: "TOKEN-123",
    });
  });

  it("uses the loaded URL token when legacy lookup payloads omit pretty_token", () => {
    const data = normalizeInvitationPayload(
      {
        data: {
          invitation: {
            id: "inv-legacy",
            event_id: "evt-legacy",
            max_guests: 2,
          },
          guest: {
            first_name: "Ana",
            last_name: "Garcia",
            rsvp_status: "pending",
          },
        },
      },
      " RAW/123 ",
    );

    expect(data).toMatchObject({
      id: "inv-legacy",
      eventId: "evt-legacy",
      guestName: "Ana Garcia",
      maxGuests: 2,
      prettyToken: "RAW/123",
      rsvpStatus: "pending",
    });
  });

  it("normalizes RSVP status casing from older backend data", () => {
    expect(
      normalizeInvitationPayload({
        data: {
          guest: {
            RSVPStatus: " CONFIRMED ",
          },
        },
      }).rsvpStatus,
    ).toBe("confirmed");
  });

  it("normalizes the backend RSVP guest count from lookup and confirmation payloads", () => {
    expect(
      normalizeInvitationPayload({
        data: {
          guest: {
            rsvp_status: "confirmed",
            rsvp_guest_count: 2,
          },
        },
      }).rsvpGuestCount,
    ).toBe(2);

    expect(
      normalizeInvitationPayload({
        rsvp_status: "confirmed",
        rsvp_guest_count: "3",
        rsvp_at: "2026-07-01T18:45:00Z",
        rsvp_method: "web",
      }).rsvpGuestCount,
    ).toBe(3);

    expect(
      normalizeInvitationPayload({
        rsvp_status: "confirmed",
        rsvp_guest_count: "3",
        rsvp_at: "2026-07-01T18:45:00Z",
        rsvp_method: "web",
      }),
    ).toMatchObject({
      rsvpStatus: "confirmed",
      rsvpAt: "2026-07-01T18:45:00Z",
      rsvpMethod: "web",
      rsvpGuestCount: 3,
    });
  });

  it("normalizes RSVP dietary restrictions and public notes aliases", () => {
    expect(
      normalizeInvitationPayload({
        data: {
          guest: {
            dietaryRestrictions: " Vegano ",
            rsvpNotes: " Mesa cerca ",
          },
        },
      }),
    ).toMatchObject({
      dietaryRestrictions: "Vegano",
      rsvpNotes: "Mesa cerca",
    });

    expect(
      normalizeInvitationPayload({
        Data: {
          Guest: {
            DietaryRestrictions: "",
            RSVPNotes: "",
          },
        },
      }),
    ).toMatchObject({
      dietaryRestrictions: "",
      rsvpNotes: "",
    });
  });

  it("accepts guest count aliases used by backend and dashboard contracts", () => {
    expect(
      normalizeInvitationPayload({
        data: {
          guest: {
            guest_count: "2",
          },
        },
      }).rsvpGuestCount,
    ).toBe(2);

    expect(
      normalizeInvitationPayload({
        data: {
          guest: {
            guests_count: 4,
          },
        },
      }).rsvpGuestCount,
    ).toBe(4);
  });

  it("normalizes invalid max guest values to a usable minimum", () => {
    expect(
      normalizeInvitationPayload({
        data: {
          invitation: {
            max_guests: 0,
          },
        },
      }).maxGuests,
    ).toBe(1);

    expect(
      normalizeInvitationPayload({
        data: {
          invitation: {
            max_guests: "3.8",
          },
        },
      }).maxGuests,
    ).toBe(3);
  });
});

describe("mergeInvitationPayload", () => {
  it("merges partial RSVP confirmation responses without losing event metadata", () => {
    const current = normalizeInvitationPayload({
      data: {
        pretty_token: "ABC-123",
        event: {
          name: "Boda Ana y Luis",
          event_date_time: "2026-08-15T20:30:00-06:00",
        },
        invitation: {
          id: "inv-1",
          event_id: "evt-1",
          max_guests: 4,
        },
        guest: {
          first_name: "Ana",
          last_name: "Garcia",
          rsvp_status: "pending",
        },
      },
    });

    expect(
      mergeInvitationPayload(current, {
        pretty_token: "ABC-123",
        guest: {
          event_id: "evt-1",
          first_name: "Ana",
          last_name: "Garcia",
          rsvp_status: "confirmed",
          rsvp_at: "2026-07-01T18:45:00Z",
          rsvp_method: "web",
          rsvp_guest_count: 2,
          dietary_restrictions: "",
          rsvp_notes: "",
        },
      }),
    ).toEqual({
      ...current,
      rsvpStatus: "confirmed",
      rsvpAt: "2026-07-01T18:45:00Z",
      rsvpMethod: "web",
      rsvpGuestCount: 2,
      dietaryRestrictions: "",
      rsvpNotes: "",
    });
  });

  it("preserves the loaded event identifier when RSVP responses are sparse", () => {
    const current = normalizeInvitationPayload({
      data: {
        pretty_token: "ABC-123",
        event: {
          identifier: "boda-ana-luis",
        },
        invitation: {
          id: "inv-1",
          event_id: "evt-1",
          max_guests: 4,
        },
        guest: {
          first_name: "Ana",
          last_name: "Garcia",
          rsvp_status: "pending",
        },
      },
    });

    expect(
      mergeInvitationPayload(current, {
        data: {
          guest: {
            rsvp_status: "confirmed",
          },
        },
      }).eventIdentifier,
    ).toBe("boda-ana-luis");
  });

  it("merges Pascal-cased RSVP confirmation envelopes", () => {
    const current = normalizeInvitationPayload({
      data: {
        pretty_token: "ABC-123",
        event: {
          name: "Boda Ana y Luis",
          event_date_time: "2026-08-15T20:30:00-06:00",
        },
        invitation: {
          id: "inv-1",
          event_id: "evt-1",
          max_guests: 4,
        },
        guest: {
          first_name: "Ana",
          last_name: "Garcia",
          rsvp_status: "pending",
        },
      },
    });

    expect(
      mergeInvitationPayload(current, {
        Status: 200,
        Message: "RSVP confirmed",
        Data: {
          PrettyToken: "ABC-123",
          Guest: {
            EventID: "evt-1",
            FirstName: "Ana",
            LastName: "Garcia",
            RSVPStatus: "confirmed",
            RSVPAt: "2026-07-01T18:45:00Z",
            RSVPMethod: "web",
            RSVPGuestCount: 2,
          },
        },
      }),
    ).toEqual({
      ...current,
      rsvpStatus: "confirmed",
      rsvpAt: "2026-07-01T18:45:00Z",
      rsvpMethod: "web",
      rsvpGuestCount: 2,
    });
  });

  it("uses local fallback status and guest count when the response body is sparse", () => {
    const current = normalizeInvitationPayload({
      data: {
        pretty_token: "ABC-123",
        invitation: {
          id: "inv-1",
          event_id: "evt-1",
          max_guests: 4,
        },
        guest: {
          first_name: "Ana",
          last_name: "Garcia",
          rsvp_status: "pending",
        },
      },
    });

    expect(
      mergeInvitationPayload(
        current,
        {},
        {
          rsvpStatus: "declined",
          rsvpMethod: "web",
          rsvpGuestCount: 0,
        },
      ),
    ).toEqual({
      ...current,
      rsvpStatus: "declined",
      rsvpMethod: "web",
      rsvpGuestCount: 0,
    });
  });

  it("uses local RSVP note and dietary fallbacks when the response body is sparse", () => {
    const current = normalizeInvitationPayload({
      data: {
        pretty_token: "ABC-123",
        invitation: {
          id: "inv-1",
          event_id: "evt-1",
          max_guests: 4,
        },
        guest: {
          first_name: "Ana",
          last_name: "Garcia",
          rsvp_status: "pending",
          dietary_restrictions: "",
          rsvp_notes: "",
        },
      },
    });

    expect(
      mergeInvitationPayload(
        current,
        {},
        {
          rsvpStatus: "confirmed",
          rsvpMethod: "web",
          rsvpGuestCount: 2,
          dietaryRestrictions: "vegano",
          rsvpNotes: "Mesa cerca",
        },
      ),
    ).toEqual({
      ...current,
      rsvpStatus: "confirmed",
      rsvpMethod: "web",
      rsvpGuestCount: 2,
      dietaryRestrictions: "vegano",
      rsvpNotes: "Mesa cerca",
    });
  });

  it("preserves explicit zero guest counts from declined backend confirmations", () => {
    const current = normalizeInvitationPayload({
      data: {
        pretty_token: "ABC-123",
        invitation: {
          id: "inv-1",
          event_id: "evt-1",
          max_guests: 4,
        },
        guest: {
          first_name: "Ana",
          last_name: "Garcia",
          rsvp_status: "confirmed",
          rsvp_guest_count: 2,
        },
      },
    });

    expect(
      mergeInvitationPayload(current, {
        status: 200,
        message: "RSVP confirmed",
        data: {
          pretty_token: "ABC-123",
          guest: {
            first_name: "Ana",
            last_name: "Garcia",
            rsvp_status: "declined",
            rsvp_method: "web",
            rsvp_guest_count: 0,
          },
        },
      }),
    ).toEqual({
      ...current,
      rsvpStatus: "declined",
      rsvpMethod: "web",
      rsvpGuestCount: 0,
    });
  });
});

describe("buildRsvpConfirmationRequest", () => {
  it("uses the backend canonical pretty_token when invitation data has one", () => {
    expect(
      buildRsvpConfirmationRequest(
        { prettyToken: " PRETTY/123 " },
        "raw/ignored",
        " CONFIRMED ",
        2.8,
        "  Mesa cerca de la pista  ",
        "  vegano  ",
      ),
    ).toEqual({
      pretty_token: "PRETTY/123",
      status: "confirmed",
      method: "web",
      guest_count: 2,
      dietary_restrictions: "vegano",
      rsvp_notes: "Mesa cerca de la pista",
    });
  });

  it("keeps legacy note-only requests when dietary restrictions are omitted", () => {
    expect(
      buildRsvpConfirmationRequest(
        { prettyToken: " PRETTY/123 " },
        null,
        "confirmed",
        1,
        "  vegano  ",
      ),
    ).toEqual({
      pretty_token: "PRETTY/123",
      status: "confirmed",
      method: "web",
      guest_count: 1,
      notes: "vegano",
    });
  });

  it("falls back to the URL token when old lookup payloads omit pretty_token", () => {
    expect(
      buildRsvpConfirmationRequest(
        { prettyToken: "" },
        " RAW/123 ",
        "declined",
        -1,
      ),
    ).toEqual({
      token: "RAW/123",
      status: "declined",
      method: "web",
      guest_count: 0,
    });
  });
});
