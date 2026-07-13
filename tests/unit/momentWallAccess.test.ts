import { describe, expect, it } from "vitest";
import {
  canShowPersonalUpload,
  resolveMomentWallPublished,
} from "../../src/lib/momentWallAccess";

describe("resolveMomentWallPublished", () => {
  it("prefers the canonical moments_wall_published flag over legacy published", () => {
    expect(
      resolveMomentWallPublished({
        moments_wall_published: false,
        published: true,
      }),
    ).toBe(false);
  });

  it("falls back to legacy published for older page specs", () => {
    expect(resolveMomentWallPublished({ published: true })).toBe(true);
  });

  it("reads backend EventConfig wall visibility aliases", () => {
    expect(resolveMomentWallPublished({ show_moment_wall: true })).toBe(true);
    expect(resolveMomentWallPublished({ show_wall: true })).toBe(true);
    expect(resolveMomentWallPublished({ showMomentWall: false })).toBe(false);
    expect(resolveMomentWallPublished({ showWall: false })).toBe(false);
  });
});

describe("canShowPersonalUpload", () => {
  it("allows personal uploads before the wall is published", () => {
    expect(
      canShowPersonalUpload({
        prettyToken: "ABC123",
        identifier: "mi-evento",
        allowUploads: true,
        wallPublished: false,
      }),
    ).toBe(true);
  });

  it("hides personal uploads once the wall is published", () => {
    expect(
      canShowPersonalUpload({
        prettyToken: "ABC123",
        identifier: "mi-evento",
        allowUploads: true,
        wallPublished: true,
      }),
    ).toBe(false);
  });

  it("requires a personal invitation token", () => {
    expect(
      canShowPersonalUpload({
        prettyToken: "",
        identifier: "mi-evento",
        allowUploads: true,
        wallPublished: false,
      }),
    ).toBe(false);
  });

  it("requires uploads to be enabled", () => {
    expect(
      canShowPersonalUpload({
        prettyToken: "ABC123",
        identifier: "mi-evento",
        allowUploads: false,
        wallPublished: false,
      }),
    ).toBe(false);
  });

  it("hides personal uploads when backend quota is exhausted", () => {
    expect(
      canShowPersonalUpload({
        prettyToken: "ABC123",
        identifier: "mi-evento",
        allowUploads: true,
        wallPublished: false,
        uploadsRemaining: 0,
      }),
    ).toBe(false);
  });

  it("keeps uploads visible when quota metadata is not available", () => {
    expect(
      canShowPersonalUpload({
        prettyToken: "ABC123",
        identifier: "mi-evento",
        allowUploads: true,
        wallPublished: false,
      }),
    ).toBe(true);
  });
});
