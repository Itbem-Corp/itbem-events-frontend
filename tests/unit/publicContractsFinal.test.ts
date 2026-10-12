import { afterEach, describe, expect, it, vi } from "vitest";

import { resolveInvitationLoaderPublicAccess } from "../../src/components/InvitationDataLoader";
import {
  EVENT_GONE_MESSAGE,
  formatRetryWait,
  getPublicApiErrorMessage,
  isEventGoneError,
  isEventPasswordRequiredError,
  readApiErrorCode,
  RSVP_CLOSED_MESSAGE,
} from "../../src/lib/apiError";
import {
  ApiFetchError,
  fetchApiResult,
  parseRetryAfterSeconds,
} from "../../src/lib/apiFetch";
import { normalizeInvitationPayload } from "../../src/lib/invitationData";
import { readPageSpecPayload } from "../../src/lib/pageSpecCache";
import { formatLockCountdown, passwordVerifyFailure, remainingLockSeconds } from "../../src/lib/passwordVerify";
import { publicAccessFetchInit } from "../../src/lib/publicPreview";
import { shouldTrackPublicView } from "../../src/lib/publicViewTracking";
import { resolvePublicWindowGate } from "../../src/lib/publicWindowGate";
import { getSharedUploadGate } from "../../src/lib/sharedUploadAccess";
import {
  readRsvpAvailability,
  RSVP_DIETARY_MAX_LENGTH,
  RSVP_NOTES_INPUT_MAX_LENGTH,
  RSVP_NOTES_MAX_LENGTH,
} from "../../src/lib/rsvpAvailability";
import { readUploadQuota } from "../../src/lib/uploadQuota";

afterEach(() => vi.unstubAllGlobals());

function lockedSpec(windowStatus: string, access: Record<string, unknown> = {}) {
  return {
    status: 200,
    data: {
      meta: {
        pageTitle: "Boda",
        identifier: "boda",
        rsvp_open: false,
        rsvp_deadline: null,
        access: { passwordProtected: false, windowStatus, ...access },
      },
      sections: [],
    },
  };
}

describe("1. page-spec access window", () => {
  it("normalises windowStatus from a locked spec with zero sections", () => {
    const spec = readPageSpecPayload(lockedSpec("not_started"));
    expect(spec?.sections).toEqual([]);
    expect(spec?.meta.access?.windowStatus).toBe("not_started");
  });

  it("uses windowStatus, not the device clock", () => {
    // Device clock says the window is open, server says it has not started.
    const future = "2000-01-01T00:00:00Z";
    expect(
      resolvePublicWindowGate(
        { windowStatus: "not_started", activeFrom: future },
        new Date("2026-10-12T00:00:00Z"),
      ),
    ).toBe("coming_soon");
    expect(resolvePublicWindowGate({ windowStatus: "ended" })).toBe("ended");
    // Device clock says ended, server says open: trust the server.
    expect(
      resolvePublicWindowGate(
        { windowStatus: "open", activeUntil: "2000-01-01T00:00:00Z" },
        new Date("2026-10-12T00:00:00Z"),
      ),
    ).toBeNull();
  });

  it("falls back to the clock only without windowStatus", () => {
    const now = new Date("2026-10-12T00:00:00Z");
    expect(resolvePublicWindowGate({ activeFrom: "2027-01-01T00:00:00Z" }, now)).toBe(
      "coming_soon",
    );
    expect(resolvePublicWindowGate({ activeUntil: "2026-01-01T00:00:00Z" }, now)).toBe(
      "ended",
    );
    expect(resolvePublicWindowGate(undefined, now)).toBeNull();
  });

  it("does not track a view outside the server window", () => {
    expect(shouldTrackPublicView({ access: { windowStatus: "ended" } })).toBe(false);
    expect(
      shouldTrackPublicView({
        access: { windowStatus: "open", activeUntil: "2000-01-01T00:00:00Z" },
      }),
    ).toBe(true);
  });
});

describe("2. RSVP open/closed exact contract paths", () => {
  it("ByToken data.event.*", () => {
    const inv = normalizeInvitationPayload({
      status: 200,
      data: {
        guest: { first_name: "Ana" },
        event: { rsvp_open: false, rsvp_deadline: "2026-10-01T05:59:59Z" },
      },
    });
    expect(inv.rsvpOpen).toBe(false);
    expect(inv.rsvpDeadline).toBe("2026-10-01T05:59:59Z");
  });

  it("ByToken data.invitation.event.*", () => {
    const inv = normalizeInvitationPayload({
      data: {
        guest: { first_name: "Ana" },
        invitation: { event: { rsvp_open: false, rsvp_deadline: null } },
      },
    });
    expect(inv.rsvpOpen).toBe(false);
    expect(inv.rsvpDeadline).toBeUndefined();
  });

  it("keeps an explicit open from ByToken so it beats a stale section config", () => {
    const inv = normalizeInvitationPayload({
      data: { guest: { first_name: "Ana" }, event: { rsvp_open: true, rsvp_deadline: null } },
    });
    expect(inv.rsvpOpen).toBe(true);
    expect(readRsvpAvailability(inv, { rsvp_open: false }).open).toBe(true);
  });

  it("page-spec RSVPConfirmation section config keeps rsvp_open / rsvp_deadline", () => {
    const spec = readPageSpecPayload({
      data: {
        meta: { identifier: "boda", rsvp_open: false, rsvp_deadline: "2026-10-01T05:59:59Z" },
        sections: [
          {
            sectionId: "s1",
            type: "RSVPConfirmation",
            order: 1,
            config: { rsvp_open: false, rsvp_deadline: "2026-10-01T05:59:59Z" },
          },
        ],
      },
    });
    const config = spec?.sections[0]?.config;
    expect(readRsvpAvailability(null, config)).toEqual({
      open: false,
      deadline: "2026-10-01T05:59:59Z",
      known: true,
    });
  });

  it("maps the exact 403 rsvp_closed body", () => {
    const err = new ApiFetchError("x", 403, {
      status: 403,
      message: "Las confirmaciones para este evento ya están cerradas.",
      code: "rsvp_closed",
    });
    expect(getPublicApiErrorMessage(err, "rsvp")).toBe(RSVP_CLOSED_MESSAGE);
  });
});

describe("3. 401 event_password_required", () => {
  const err = new ApiFetchError("x", 401, {
    status: 401,
    message: "Esta invitación está protegida con contraseña.",
    code: "event_password_required",
  });

  it("is recognised and gets password copy, not the invalid-link copy", () => {
    expect(isEventPasswordRequiredError(err)).toBe(true);
    expect(getPublicApiErrorMessage(err, "invitation")).toMatch(/contraseña/);
    expect(getPublicApiErrorMessage(err, "invitation")).not.toMatch(/enlace ya no es válido/);
  });

  it("the RSVP card sends X-Event-Access-Token once the password is verified", () => {
    const access = resolveInvitationLoaderPublicAccess(
      "PRETTY1",
      { accessToken: "proof-123", invitationToken: "PRETTY1" },
      "",
    );
    expect(access.accessToken).toBe("proof-123");
    const headers = new Headers(publicAccessFetchInit(access, { method: "POST" })?.headers);
    expect(headers.get("X-Event-Access-Token")).toBe("proof-123");
  });
});

describe("4. 429 too_many_attempts with Retry-After", () => {
  it("parses Retry-After seconds and dates", () => {
    expect(parseRetryAfterSeconds("600")).toBe(600);
    expect(parseRetryAfterSeconds("0")).toBe(1);
    expect(parseRetryAfterSeconds(null)).toBeUndefined();
    expect(parseRetryAfterSeconds("soon")).toBeUndefined();
    const now = Date.parse("2026-10-12T00:00:00Z");
    expect(parseRetryAfterSeconds("Mon, 12 Oct 2026 00:01:30 GMT", now)).toBe(90);
  });

  it("fetchApiResult exposes Retry-After on the failed result", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            status: 429,
            message: "Demasiados intentos. Espera unos minutos e inténtalo de nuevo.",
            code: "too_many_attempts",
          }),
          { status: 429, headers: { "Retry-After": "900" } },
        ),
      ),
    );
    const result = await fetchApiResult("/api/events/boda/verify-access", { method: "POST" });
    expect(result.retryAfterSeconds).toBe(900);
    const failure = passwordVerifyFailure(result);
    expect(failure.retryAfterSeconds).toBe(900);
    expect(failure.message).toBe(
      "Hiciste demasiados intentos con la contraseña. Espera 15 minutos e inténtalo de nuevo.",
    );
  });

  it("locks for the backend's 10-minute window when Retry-After is unreadable", () => {
    // PUB-71: without Retry-After exposed through CORS the guest was told
    // "1 minuto" and bumped into the same ~10 minute lock again.
    const failure = passwordVerifyFailure({ status: 429, payload: { code: "too_many_attempts" } });
    expect(failure.retryAfterSeconds).toBe(600);
    expect(failure.message).toBe(
      "Hiciste demasiados intentos con la contraseña. Espera 10 minutos e inténtalo de nuevo.",
    );
  });

  it("uses the exposed Retry-After for both the message and the countdown", () => {
    const failure = passwordVerifyFailure({
      status: 429,
      payload: { code: "too_many_attempts" },
      retryAfterSeconds: 575,
    });
    expect(failure.retryAfterSeconds).toBe(575);
    expect(failure.message).toContain("Espera 10 minutos");
  });

  it("a wrong password does not lock", () => {
    const failure = passwordVerifyFailure({
      status: 401,
      payload: { status: 401, message: "Contraseña incorrecta" },
    });
    expect(failure.retryAfterSeconds).toBeUndefined();
    expect(failure.message).toBe("Contraseña incorrecta. Intenta de nuevo.");
  });

  it("formats the wait and counts the lock down", () => {
    expect(formatRetryWait(1)).toBe("1 segundo");
    expect(formatRetryWait(45)).toBe("45 segundos");
    expect(formatRetryWait(60)).toBe("1 minuto");
    expect(formatRetryWait(601)).toBe("11 minutos");
    expect(remainingLockSeconds(10_500, 1_000)).toBe(10);
    expect(remainingLockSeconds(500, 1_000)).toBe(0);
    expect(remainingLockSeconds(null)).toBe(0);
    // QA PUB-N2: the second line is a clock, not the message again.
    expect(formatLockCountdown(600)).toBe("10:00");
    expect(formatLockCountdown(598)).toBe("9:58");
    expect(formatLockCountdown(5)).toBe("0:05");
    expect(formatLockCountdown(-3)).toBe("0:00");
  });
});

describe("5. 410 event_gone", () => {
  it("shows the gone copy on ByToken and RSVP", () => {
    const err = new ApiFetchError("x", 410, {
      status: 410,
      message: "Este evento ya no está disponible",
      error: "event_gone",
    });
    expect(isEventGoneError(err)).toBe(true);
    expect(getPublicApiErrorMessage(err, "invitation")).toBe(EVENT_GONE_MESSAGE);
    expect(getPublicApiErrorMessage(err, "rsvp")).toBe(EVENT_GONE_MESSAGE);
  });
});

describe("6. RSVP text limits and save failures", () => {
  it("input limits match the backend", () => {
    expect(RSVP_DIETARY_MAX_LENGTH).toBe(255);
    expect(RSVP_NOTES_MAX_LENGTH).toBe(1000);
    expect(RSVP_NOTES_INPUT_MAX_LENGTH).toBe(1000);
  });

  it("reads the code from the error field and shows the Spanish backend message", () => {
    const payload = {
      status: 400,
      message: "El campo «rsvp_notes» admite máximo 1000 caracteres.",
      error: "rsvp_text_too_long",
    };
    expect(readApiErrorCode(payload)).toBe("rsvp_text_too_long");
    expect(getPublicApiErrorMessage(new ApiFetchError("x", 400, payload), "rsvp")).toBe(
      "El campo «rsvp_notes» admite máximo 1000 caracteres.",
    );
  });

  it("maps 500 rsvp_save_failed to Spanish", () => {
    const err = new ApiFetchError("x", 500, {
      status: 500,
      message: "No se pudo guardar",
      error: "rsvp_save_failed",
    });
    expect(getPublicApiErrorMessage(err, "rsvp")).toBe(
      "No pudimos guardar tu respuesta. Inténtalo de nuevo en unos minutos.",
    );
  });

  it("does not treat a sentence in error as a code", () => {
    expect(readApiErrorCode({ error: "invalid or expired token" })).toBeNull();
  });
});

describe("7. 429 upload quota with the device key", () => {
  it("the 429 body still drives the limit-reached screen", () => {
    const body = {
      status: 429,
      message: "Gracias por compartir tus momentos en Boda. Ya registramos tus contribuciones permitidas.",
      data: {
        message: "Gracias por compartir tus momentos en Boda.",
        already_uploaded: true,
        event_name: "Boda",
        uploads_limit: 30,
        uploads_used: 30,
        uploads_remaining: 0,
      },
    };
    const quota = readUploadQuota(body);
    expect(quota.remaining).toBe(0);
    expect(
      getSharedUploadGate({
        uploadsNotEnabled: false,
        wallPublished: false,
        quotaLoaded: true,
        uploadsRemaining: quota.remaining,
      }),
    ).toBe("limit-reached");
  });
});
