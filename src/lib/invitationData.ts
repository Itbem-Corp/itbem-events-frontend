export interface InvitationData {
  id: string;
  eventId: string;
  guestName: string;
  maxGuests: number;
  prettyToken: string;
  rsvpStatus: string;
  rsvpAt?: string;
  rsvpMethod?: string;
  rsvpGuestCount?: number;
  dietaryRestrictions?: string;
  rsvpNotes?: string;
  eventName: string;
  eventIdentifier?: string;
  eventDate: string;
  eventTimezone?: string;
}

export interface RsvpConfirmationRequest {
  pretty_token?: string;
  token?: string;
  status: string;
  method: string;
  guest_count: number;
  dietary_restrictions?: string;
  rsvp_notes?: string;
  notes?: string;
}

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function asRecord(value: unknown): UnknownRecord {
  return isRecord(value) ? value : {};
}

function firstRecord(...values: unknown[]): UnknownRecord {
  let emptyRecord: UnknownRecord | undefined;

  for (const value of values) {
    if (!isRecord(value)) continue;
    if (Object.keys(value).length > 0) return value;
    emptyRecord ??= value;
  }

  return emptyRecord ?? {};
}

function firstString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (trimmed) return trimmed;
  }
  return "";
}

function firstPresentString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value !== "string") continue;
    return value.trim();
  }
  return undefined;
}

function normalizeRsvpStatus(value: string): string {
  return value.trim().toLowerCase();
}

function firstPositiveInt(fallback: number, ...values: unknown[]): number {
  for (const value of values) {
    const numeric =
      typeof value === "number"
        ? value
        : typeof value === "string" && value.trim()
          ? Number(value)
          : null;
    if (typeof numeric === "number" && Number.isFinite(numeric)) {
      return Math.max(1, Math.trunc(numeric));
    }
  }
  return fallback;
}

function firstNonNegativeInt(...values: unknown[]): number | undefined {
  for (const value of values) {
    const numeric =
      typeof value === "number"
        ? value
        : typeof value === "string" && value.trim()
          ? Number(value)
          : null;
    if (typeof numeric === "number" && Number.isFinite(numeric)) {
      return Math.max(0, Math.trunc(numeric));
    }
  }
  return undefined;
}

export function normalizeInvitationPayload(
  payload: unknown,
  fallbackToken?: string | null,
): InvitationData {
  const root = asRecord(payload);
  const data = firstRecord(root.data, root.Data, root);
  const invitation = firstRecord(data.invitation, data.Invitation);
  const guest = firstRecord(data.guest, data.Guest);
  const event = firstRecord(
    data.event,
    data.Event,
    invitation.event,
    invitation.Event,
  );

  const firstName = firstString(
    guest.first_name,
    guest.firstName,
    guest.FirstName,
  );
  const lastName = firstString(guest.last_name, guest.lastName, guest.LastName);

  const rsvpGuestCount = firstNonNegativeInt(
    guest.rsvp_guest_count,
    guest.rsvpGuestCount,
    guest.RSVPGuestCount,
    guest.guest_count,
    guest.guestCount,
    guest.GuestCount,
    guest.guests_count,
    guest.guestsCount,
    guest.GuestsCount,
    data.rsvp_guest_count,
    data.rsvpGuestCount,
    data.RSVPGuestCount,
    data.guest_count,
    data.guestCount,
    data.GuestCount,
    data.guests_count,
    data.guestsCount,
    data.GuestsCount,
  );

  const rsvpAt = firstString(
    guest.rsvp_at,
    guest.rsvpAt,
    guest.RSVPAt,
    data.rsvp_at,
    data.rsvpAt,
    data.RSVPAt,
  );
  const rsvpMethod = firstString(
    guest.rsvp_method,
    guest.rsvpMethod,
    guest.RSVPMethod,
    data.rsvp_method,
    data.rsvpMethod,
    data.RSVPMethod,
  );
  const dietaryRestrictions = firstPresentString(
    guest.dietary_restrictions,
    guest.dietaryRestrictions,
    guest.DietaryRestrictions,
    data.dietary_restrictions,
    data.dietaryRestrictions,
    data.DietaryRestrictions,
  );
  const rsvpNotes = firstPresentString(
    guest.rsvp_notes,
    guest.rsvpNotes,
    guest.RSVPNotes,
    data.rsvp_notes,
    data.rsvpNotes,
    data.RSVPNotes,
  );
  const eventIdentifier = firstString(
    event.identifier,
    event.Identifier,
    event.event_identifier,
    event.eventIdentifier,
    event.EventIdentifier,
    data.identifier,
    data.Identifier,
    data.event_identifier,
    data.eventIdentifier,
    data.EventIdentifier,
    invitation.identifier,
    invitation.Identifier,
    invitation.event_identifier,
    invitation.eventIdentifier,
    invitation.EventIdentifier,
  );

  const result: InvitationData = {
    id: firstString(invitation.id, invitation.ID, data.id, data.ID),
    eventId: firstString(
      invitation.event_id,
      invitation.eventId,
      invitation.EventID,
      guest.event_id,
      guest.eventId,
      guest.EventID,
      data.event_id,
      data.eventId,
      data.EventID,
    ),
    guestName: `${firstName} ${lastName}`.trim(),
    maxGuests: firstPositiveInt(
      1,
      invitation.max_guests,
      invitation.maxGuests,
      invitation.MaxGuests,
      data.max_guests,
      data.maxGuests,
      data.MaxGuests,
      guest.max_guests,
      guest.maxGuests,
      guest.MaxGuests,
    ),
    prettyToken: firstString(
      data.pretty_token,
      data.prettyToken,
      data.PrettyToken,
      invitation.pretty_token,
      invitation.prettyToken,
      invitation.PrettyToken,
      guest.pretty_token,
      guest.prettyToken,
      guest.PrettyToken,
      fallbackToken,
    ),
    rsvpStatus: normalizeRsvpStatus(
      firstString(
        guest.rsvp_status,
        guest.rsvpStatus,
        guest.RSVPStatus,
        data.rsvp_status,
        data.rsvpStatus,
        data.RSVPStatus,
      ),
    ),
    eventName: firstString(
      event.name,
      event.Name,
      data.event_name,
      data.eventName,
      data.EventName,
      invitation.event_name,
      invitation.eventName,
      invitation.EventName,
    ),
    eventDate: firstString(
      event.event_date_time,
      event.eventDateTime,
      event.EventDateTime,
      event.event_date,
      event.eventDate,
      event.EventDate,
      data.event_date_time,
      data.eventDateTime,
      data.EventDateTime,
      data.event_date,
      data.eventDate,
      data.EventDate,
      invitation.event_date_time,
      invitation.eventDateTime,
      invitation.EventDateTime,
      invitation.event_date,
      invitation.eventDate,
      invitation.EventDate,
    ),
  };
  const eventTimezone = firstString(
    event.timezone,
    event.timeZone,
    event.Timezone,
    event.TimeZone,
    data.timezone,
    data.timeZone,
    data.Timezone,
    data.TimeZone,
  );
  if (rsvpAt) result.rsvpAt = rsvpAt;
  if (rsvpMethod) result.rsvpMethod = rsvpMethod;
  if (rsvpGuestCount !== undefined) result.rsvpGuestCount = rsvpGuestCount;
  if (dietaryRestrictions !== undefined)
    result.dietaryRestrictions = dietaryRestrictions;
  if (rsvpNotes !== undefined) result.rsvpNotes = rsvpNotes;
  if (eventIdentifier) result.eventIdentifier = eventIdentifier;
  if (eventTimezone) result.eventTimezone = eventTimezone;
  return result;
}

export function mergeInvitationPayload(
  current: InvitationData,
  payload: unknown,
  fallback?: Partial<
    Pick<
      InvitationData,
      | "rsvpStatus"
      | "rsvpAt"
      | "rsvpMethod"
      | "rsvpGuestCount"
      | "dietaryRestrictions"
      | "rsvpNotes"
    >
  >,
): InvitationData {
  const next = normalizeInvitationPayload(payload);
  return {
    ...current,
    id: next.id || current.id,
    eventId: next.eventId || current.eventId,
    guestName: next.guestName || current.guestName,
    prettyToken: next.prettyToken || current.prettyToken,
    rsvpStatus: next.rsvpStatus || fallback?.rsvpStatus || current.rsvpStatus,
    rsvpAt: next.rsvpAt || fallback?.rsvpAt || current.rsvpAt,
    rsvpMethod: next.rsvpMethod || fallback?.rsvpMethod || current.rsvpMethod,
    rsvpGuestCount:
      next.rsvpGuestCount ?? fallback?.rsvpGuestCount ?? current.rsvpGuestCount,
    dietaryRestrictions:
      next.dietaryRestrictions ??
      fallback?.dietaryRestrictions ??
      current.dietaryRestrictions,
    rsvpNotes: next.rsvpNotes ?? fallback?.rsvpNotes ?? current.rsvpNotes,
    eventName: next.eventName || current.eventName,
    eventIdentifier: next.eventIdentifier || current.eventIdentifier,
    eventDate: next.eventDate || current.eventDate,
    eventTimezone: next.eventTimezone || current.eventTimezone,
  };
}

export function buildRsvpConfirmationRequest(
  invitation: Pick<InvitationData, "prettyToken">,
  fallbackToken: string | null | undefined,
  status: string,
  guestCount: number,
  notes?: string,
  dietaryRestrictions?: string,
): RsvpConfirmationRequest {
  const prettyToken = invitation.prettyToken.trim();
  const rawToken = fallbackToken?.trim() ?? "";
  const normalizedGuestCount = Number.isFinite(guestCount)
    ? Math.max(0, Math.trunc(guestCount))
    : 0;
  const request: RsvpConfirmationRequest = {
    status: status.trim().toLowerCase(),
    method: "web",
    guest_count: normalizedGuestCount,
  };

  if (prettyToken) {
    request.pretty_token = prettyToken;
  } else if (rawToken) {
    request.token = rawToken;
  }

  if (dietaryRestrictions !== undefined) {
    request.dietary_restrictions = dietaryRestrictions.trim();
  }

  if (notes !== undefined) {
    const cleanNotes = notes.trim();
    if (dietaryRestrictions !== undefined) {
      request.rsvp_notes = cleanNotes;
    } else if (cleanNotes) {
      request.notes = cleanNotes;
    }
  }

  return request;
}
