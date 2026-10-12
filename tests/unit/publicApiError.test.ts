import { describe, expect, it } from "vitest";

import { ApiFetchError } from "../../src/lib/apiFetch";
import {
  getPublicApiErrorMessage,
  isRsvpClosedError,
  readApiErrorCode,
  RSVP_CLOSED_MESSAGE,
} from "../../src/lib/apiError";

function apiError(status: number, payload: unknown) {
  return new ApiFetchError("backend text", status, payload);
}

describe("getPublicApiErrorMessage", () => {
  it("maps rsvp_closed by code", () => {
    const err = apiError(403, { status: 403, code: "rsvp_closed", message: "RSVP closed" });
    expect(isRsvpClosedError(err)).toBe(true);
    expect(getPublicApiErrorMessage(err, "rsvp")).toBe(RSVP_CLOSED_MESSAGE);
  });

  it("maps rsvp_closed when only the error text carries it", () => {
    const err = apiError(403, { status: 403, message: "Forbidden", error: "rsvp_closed" });
    expect(isRsvpClosedError(err)).toBe(true);
    expect(getPublicApiErrorMessage(err, "rsvp")).toBe(RSVP_CLOSED_MESSAGE);
  });

  it("reads codes nested under data", () => {
    expect(readApiErrorCode({ data: { code: "RSVP_CLOSED" } })).toBe("rsvp_closed");
  });

  it("does not flag unrelated 403s as rsvp_closed", () => {
    expect(isRsvpClosedError(apiError(403, { message: "Event is not public" }))).toBe(false);
  });

  it("never shows the raw invalid-token text", () => {
    const err = apiError(401, {
      status: 401,
      message: "RSVP confirmation failed",
      error: "invalid or expired token",
    });
    const msg = getPublicApiErrorMessage(err, "rsvp");
    expect(msg).toMatch(/enlace ya no es válido/);
    expect(msg).not.toMatch(/token/i);
  });

  it("maps ByToken record-not-found to the invalid link copy", () => {
    const err = apiError(401, {
      status: 401,
      message: "Invalid or expired token",
      error: "record not found",
    });
    expect(getPublicApiErrorMessage(err, "invitation")).toMatch(/enlace ya no es válido/);
  });

  it("maps a closed event window", () => {
    const err = apiError(403, { status: 403, message: "Event is not public" });
    expect(getPublicApiErrorMessage(err, "invitation")).toBe(
      "Esta invitación aún no está disponible o ya cerró.",
    );
  });

  it("maps too many password attempts", () => {
    const err = apiError(429, { status: 429, message: "Too many requests" });
    expect(getPublicApiErrorMessage(err, "password")).toMatch(
      /demasiados intentos con la contraseña/,
    );
    expect(getPublicApiErrorMessage(err, "rsvp")).toMatch(/demasiados intentos/i);
  });

  it("maps a wrong password from a fetchApiResult-like object", () => {
    const result = { ok: false, status: 401, payload: { message: "invalid password" } };
    expect(getPublicApiErrorMessage(result, "password")).toBe(
      "Contraseña incorrecta. Intenta de nuevo.",
    );
  });

  it("maps guest count over the allowed max", () => {
    const err = apiError(400, {
      status: 400,
      message: "Invalid RSVP request",
      error: "invalid RSVP request: guest count (3) exceeds allowed max (2)",
    });
    expect(getPublicApiErrorMessage(err, "rsvp")).toBe(
      "Elegiste más personas de las permitidas en tu invitación.",
    );
  });

  it("hides raw Postgres length errors", () => {
    const err = apiError(401, {
      status: 401,
      message: "RSVP confirmation failed",
      error: "ERROR: value too long for type character varying(255) (SQLSTATE 22001)",
    });
    const msg = getPublicApiErrorMessage(err, "rsvp");
    expect(msg).toMatch(/demasiado largo/);
    expect(msg).not.toMatch(/SQLSTATE|varying/);
  });

  it("maps server errors and network failures to Spanish", () => {
    expect(getPublicApiErrorMessage(apiError(502, null), "rsvp")).toMatch(/nuestro lado/);
    expect(getPublicApiErrorMessage(new TypeError("Failed to fetch"), "rsvp")).toMatch(
      /Revisa tu conexión/,
    );
  });

  it("falls back to fixed Spanish copy for unknown English errors", () => {
    const err = apiError(409, { status: 409, message: "Something odd happened" });
    expect(getPublicApiErrorMessage(err, "rsvp")).toBe(
      "No pudimos guardar tu respuesta. Inténtalo de nuevo.",
    );
  });
});
