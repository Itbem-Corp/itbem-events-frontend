import { describe, expect, it } from "vitest";
import { shouldTrackPublicView } from "../../src/lib/publicViewTracking";

describe("shouldTrackPublicView", () => {
  const now = "2026-07-08T12:00:00.000Z";

  it("tracks open public pages", () => {
    expect(shouldTrackPublicView({ now })).toBe(true);
    expect(
      shouldTrackPublicView({
        now,
        access: {
          activeFrom: "2026-07-01T12:00:00.000Z",
          activeUntil: "2026-07-09T12:00:00.000Z",
        },
      }),
    ).toBe(true);
  });

  it("does not track backend-authorized Studio preview", () => {
    expect(shouldTrackPublicView({ now, previewAuthorized: true })).toBe(false);
  });

  it("does not track outside the public access window", () => {
    expect(
      shouldTrackPublicView({
        now,
        access: { activeFrom: "2026-07-09T12:00:00.000Z" },
      }),
    ).toBe(false);

    expect(
      shouldTrackPublicView({
        now,
        access: { activeUntil: "2026-07-07T12:00:00.000Z" },
      }),
    ).toBe(false);
  });

  it("tracks password-protected pages only after verification", () => {
    expect(
      shouldTrackPublicView({
        now,
        access: { passwordProtected: true },
        passwordVerified: false,
      }),
    ).toBe(false);

    expect(
      shouldTrackPublicView({
        now,
        access: { passwordProtected: true },
        passwordVerified: true,
      }),
    ).toBe(true);
  });

  it("ignores invalid access dates instead of blocking analytics forever", () => {
    expect(
      shouldTrackPublicView({
        now,
        access: { activeFrom: "not-a-date", activeUntil: "also-not-a-date" },
      }),
    ).toBe(true);
  });
});
