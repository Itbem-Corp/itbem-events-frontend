import { describe, expect, it } from "vitest";

import {
  isHostsSectionType,
  publicAttendeesSectionTitle,
} from "../../src/lib/sectionLabels";

describe("sectionLabels", () => {
  it("recognizes host section aliases from the backend", () => {
    expect(isHostsSectionType("Hosts")).toBe(true);
    expect(isHostsSectionType("HOST")).toBe(true);
    expect(isHostsSectionType("HOSTS")).toBe(true);
    expect(isHostsSectionType("HOST_SECTION")).toBe(true);
    expect(isHostsSectionType("hosts-section")).toBe(true);
    expect(isHostsSectionType("HostSection")).toBe(true);
    expect(isHostsSectionType("HostsSection")).toBe(true);
    expect(isHostsSectionType("GraduatesList")).toBe(false);
  });

  it("uses configured public titles before type fallbacks", () => {
    expect(publicAttendeesSectionTitle("Hosts", "Equipo anfitrion", {})).toBe(
      "Equipo anfitrion",
    );
    expect(
      publicAttendeesSectionTitle("HostsSection", "", {
        title: "Personas destacadas",
      }),
    ).toBe("Personas destacadas");
  });

  it("falls back to labels that match the rendered section type", () => {
    expect(publicAttendeesSectionTitle("Hosts", "", {})).toBe("Anfitriones");
    expect(publicAttendeesSectionTitle("HOST", "", {})).toBe("Anfitriones");
    expect(publicAttendeesSectionTitle("HOST_SECTION", "", {})).toBe(
      "Anfitriones",
    );
    expect(publicAttendeesSectionTitle("GraduatesList", "", {})).toBe(
      "Graduados",
    );
  });
});
