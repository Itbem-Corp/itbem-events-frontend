import { describe, expect, it } from "vitest";

import {
  SECTION_REGISTRY,
  isRsvpSectionType,
  resolveSectionRegistryEntry,
} from "../../src/components/engine/registry";

describe("SECTION_REGISTRY", () => {
  it("keeps legacy SCHEDULE sections wired to the Agenda renderer", () => {
    expect(SECTION_REGISTRY.SCHEDULE).toBe(SECTION_REGISTRY.Agenda);
    expect(SECTION_REGISTRY.AgendaSection).toBe(SECTION_REGISTRY.Agenda);
    expect(SECTION_REGISTRY.SCHEDULE.hydration).toBe("visible");
  });

  it("registers classic dashboard section types used by PageSpec", () => {
    expect(SECTION_REGISTRY.HERO.hydration).toBe("immediate");
    expect(SECTION_REGISTRY.TEXT.hydration).toBe("visible");
    expect(SECTION_REGISTRY.GALLERY.hydration).toBe("visible");
    expect(SECTION_REGISTRY.MAP.hydration).toBe("visible");
    expect(SECTION_REGISTRY.MUSIC.hydration).toBe("immediate");
  });

  it("keeps long backend legacy section aliases renderable", () => {
    expect(SECTION_REGISTRY.LegacyHero).toBe(SECTION_REGISTRY.HERO);
    expect(SECTION_REGISTRY.LegacyText).toBe(SECTION_REGISTRY.TEXT);
    expect(SECTION_REGISTRY.LegacyGallery).toBe(SECTION_REGISTRY.GALLERY);
    expect(SECTION_REGISTRY.LegacyMap).toBe(SECTION_REGISTRY.MAP);
    expect(SECTION_REGISTRY.LegacyMusic).toBe(SECTION_REGISTRY.MUSIC);
    expect(SECTION_REGISTRY.LegacySchedule).toBe(SECTION_REGISTRY.Agenda);
  });

  it("keeps backend legacy aliases wired to renderable public sections", () => {
    expect(SECTION_REGISTRY.Hosts).toBe(SECTION_REGISTRY.GraduatesList);
    expect(SECTION_REGISTRY.HostSection).toBe(SECTION_REGISTRY.GraduatesList);
    expect(SECTION_REGISTRY.HostsSection).toBe(SECTION_REGISTRY.GraduatesList);
    expect(SECTION_REGISTRY.Contact).toBe(SECTION_REGISTRY.TEXT);
    expect(SECTION_REGISTRY.ContactSection).toBe(SECTION_REGISTRY.TEXT);
  });

  it("keeps imported uppercase and underscore aliases renderable", () => {
    expect(SECTION_REGISTRY.AGENDA).toBe(SECTION_REGISTRY.Agenda);
    expect(SECTION_REGISTRY.AGENDA_SECTION).toBe(SECTION_REGISTRY.Agenda);
    expect(SECTION_REGISTRY.HOSTS).toBe(SECTION_REGISTRY.GraduatesList);
    expect(SECTION_REGISTRY.HOST_SECTION).toBe(SECTION_REGISTRY.GraduatesList);
    expect(SECTION_REGISTRY.PHOTO_GRID).toBe(SECTION_REGISTRY.PhotoGrid);
    expect(SECTION_REGISTRY.PHOTO_GALLERY).toBe(SECTION_REGISTRY.PhotoGrid);
    expect(SECTION_REGISTRY.RSVP).toBe(SECTION_REGISTRY.RSVPConfirmation);
    expect(SECTION_REGISTRY.RSVP_SECTION).toBe(SECTION_REGISTRY.RSVPConfirmation);
    expect(SECTION_REGISTRY.RSVP_CONFIRMATION).toBe(SECTION_REGISTRY.RSVPConfirmation);
    expect(SECTION_REGISTRY.MOMENT_WALL).toBe(SECTION_REGISTRY.MomentWall);
    expect(SECTION_REGISTRY.MOMENTS_WALL).toBe(SECTION_REGISTRY.MomentWall);
    expect(SECTION_REGISTRY.EVENT_VENUE).toBe(SECTION_REGISTRY.EventVenue);
    expect(SECTION_REGISTRY.EVENT_LOCATION).toBe(SECTION_REGISTRY.EventVenue);
    expect(SECTION_REGISTRY.SECOND_LOCATION).toBe(SECTION_REGISTRY.Reception);
    expect(SECTION_REGISTRY.CONTACT_SECTION).toBe(SECTION_REGISTRY.TEXT);
    expect(SECTION_REGISTRY.LEGACY_HERO).toBe(SECTION_REGISTRY.HERO);
    expect(SECTION_REGISTRY.LEGACY_SCHEDULE).toBe(SECTION_REGISTRY.Agenda);
  });

  it("detects RSVP aliases for /rsvp auto-scroll", () => {
    expect(isRsvpSectionType("RSVPConfirmation")).toBe(true);
    expect(isRsvpSectionType("RSVP_SECTION")).toBe(true);
    expect(isRsvpSectionType("rsvp-confirmation")).toBe(true);
    expect(isRsvpSectionType("MomentWall")).toBe(false);
  });

  it("resolves backend-normalized aliases even when PageSpec keeps original casing", () => {
    expect(resolveSectionRegistryEntry("host")).toBe(
      SECTION_REGISTRY.GraduatesList,
    );
    expect(resolveSectionRegistryEntry("rsvp-section")).toBe(
      SECTION_REGISTRY.RSVPConfirmation,
    );
    expect(resolveSectionRegistryEntry("momentwall")).toBe(
      SECTION_REGISTRY.MomentWall,
    );
    expect(resolveSectionRegistryEntry("photo-grid")).toBe(
      SECTION_REGISTRY.PhotoGrid,
    );
    expect(resolveSectionRegistryEntry("legacy schedule")).toBe(
      SECTION_REGISTRY.Agenda,
    );
  });

  it("resolves all dashboard canonical section types used by public PageSpec", () => {
    for (const type of [
      "Agenda",
      "CountdownHeader",
      "EventVenue",
      "Reception",
      "GraduationHero",
      "GraduatesList",
      "Hosts",
      "PhotoGrid",
      "RSVPConfirmation",
      "MomentWall",
      "Contact",
      "HERO",
      "TEXT",
      "GALLERY",
      "MAP",
      "MUSIC",
    ]) {
      expect(resolveSectionRegistryEntry(type), type).toBeDefined();
    }
  });
});
