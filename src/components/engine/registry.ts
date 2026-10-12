import type { ComponentType } from "react";
import type { HydrationMode, SectionComponentProps } from "./types";

export interface RegistryEntry {
  /** Dynamic import — section JS is only fetched when needed */
  loader: () => Promise<{ default: ComponentType<SectionComponentProps> }>;
  hydration: HydrationMode;
  /**
   * Size of the placeholder shown until the section JS loads. Defaults to the
   * generic h-64 card; set it when the real section is much taller or shorter
   * so the page does not jump when it hydrates (QA PUB-109).
   */
  placeholderClassName?: string;
}

const agendaEntry: RegistryEntry = {
  loader: () => import("../sections/AgendaSection"),
  hydration: "visible",
};

const graduatesListEntry: RegistryEntry = {
  loader: () => import("../sections/GraduatesList"),
  hydration: "visible",
};

const legacyTextEntry: RegistryEntry = {
  loader: () => import("../sections/LegacyText"),
  hydration: "visible",
};

const legacyHeroEntry: RegistryEntry = {
  loader: () => import("../sections/LegacyHero"),
  hydration: "immediate",
};

const legacyGalleryEntry: RegistryEntry = {
  loader: () => import("../sections/LegacyGallery"),
  hydration: "visible",
};

const legacyMapEntry: RegistryEntry = {
  loader: () => import("../sections/LegacyMap"),
  hydration: "visible",
};

const legacyMusicEntry: RegistryEntry = {
  loader: () => import("../sections/LegacyMusic"),
  hydration: "immediate",
  // A floating player: it takes no room in the page flow.
  placeholderClassName: "h-0",
};

const countdownEntry: RegistryEntry = {
  loader: () => import("../sections/CountdownHeader"),
  hydration: "immediate",
  placeholderClassName: "h-[7.75rem] sm:h-32",
};

const graduationHeroEntry: RegistryEntry = {
  loader: () => import("../sections/GraduationHero"),
  hydration: "immediate",
};

const eventVenueEntry: RegistryEntry = {
  loader: () => import("../sections/EventVenue"),
  hydration: "visible",
};

const receptionEntry: RegistryEntry = {
  loader: () => import("../sections/Reception"),
  hydration: "visible",
};

const photoGridEntry: RegistryEntry = {
  loader: () => import("../sections/PhotoGrid"),
  hydration: "visible",
};

const rsvpEntry: RegistryEntry = {
  loader: () => import("../sections/RSVPConfirmation"),
  hydration: "immediate",
  // Matches the loading skeleton inside RSVPConfirmation plus its padding.
  placeholderClassName: "h-[30.75rem] sm:h-[29rem]",
};

const momentWallEntry: RegistryEntry = {
  loader: () => import("../sections/MomentWall"),
  hydration: "visible",
};

function sectionTypeToken(type: string): string {
  return type
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, "");
}

const SECTION_REGISTRY_BY_TOKEN: Record<string, RegistryEntry> = {
  countdown: countdownEntry,
  countdownheader: countdownEntry,
  graduationhero: graduationHeroEntry,
  graduationheader: graduationHeroEntry,
  eventvenue: eventVenueEntry,
  eventlocation: eventVenueEntry,
  venue: eventVenueEntry,
  reception: receptionEntry,
  secondlocation: receptionEntry,
  graduateslist: graduatesListEntry,
  host: graduatesListEntry,
  hosts: graduatesListEntry,
  hostsection: graduatesListEntry,
  hostssection: graduatesListEntry,
  photogrid: photoGridEntry,
  photogallery: photoGridEntry,
  rsvp: rsvpEntry,
  rsvpsection: rsvpEntry,
  rsvpconfirmation: rsvpEntry,
  agenda: agendaEntry,
  agendasection: agendaEntry,
  schedule: agendaEntry,
  legacyschedule: agendaEntry,
  momentwall: momentWallEntry,
  momentswall: momentWallEntry,
  hero: legacyHeroEntry,
  legacyhero: legacyHeroEntry,
  text: legacyTextEntry,
  legacytext: legacyTextEntry,
  contact: legacyTextEntry,
  contactsection: legacyTextEntry,
  gallery: legacyGalleryEntry,
  legacygallery: legacyGalleryEntry,
  map: legacyMapEntry,
  legacymap: legacyMapEntry,
  music: legacyMusicEntry,
  legacymusic: legacyMusicEntry,
};

export function isRsvpSectionType(type: string): boolean {
  switch (sectionTypeToken(type)) {
    case "rsvp":
    case "rsvpsection":
    case "rsvpconfirmation":
      return true;
    default:
      return false;
  }
}

export function resolveSectionRegistryEntry(
  type: string,
): RegistryEntry | undefined {
  return (
    SECTION_REGISTRY[type] ??
    SECTION_REGISTRY[type.trim()] ??
    SECTION_REGISTRY[type.trim().toUpperCase()] ??
    SECTION_REGISTRY_BY_TOKEN[sectionTypeToken(type)]
  );
}

/**
 * Maps section type strings (from PageSpec) to their React component and
 * hydration strategy.
 *
 * To add a new section type:
 *   1. Create src/components/sections/MySection.tsx
 *   2. Add one entry here
 *   3. Use the type string in any event config under src/events/
 */
export const SECTION_REGISTRY: Record<string, RegistryEntry> = {
  CountdownHeader: countdownEntry,
  COUNTDOWN: countdownEntry,
  COUNTDOWN_HEADER: countdownEntry,
  COUNTDOWNHEADER: countdownEntry,
  GraduationHero: graduationHeroEntry,
  GRADUATION_HERO: graduationHeroEntry,
  GRADUATION_HEADER: graduationHeroEntry,
  EventVenue: eventVenueEntry,
  EVENT_VENUE: eventVenueEntry,
  EVENT_LOCATION: eventVenueEntry,
  VENUE: eventVenueEntry,
  Reception: receptionEntry,
  SECOND_LOCATION: receptionEntry,
  GraduatesList: graduatesListEntry,
  Hosts: graduatesListEntry,
  HOST: graduatesListEntry,
  HOSTS: graduatesListEntry,
  HostSection: graduatesListEntry,
  HostsSection: graduatesListEntry,
  HOST_SECTION: graduatesListEntry,
  HOSTS_SECTION: graduatesListEntry,
  PhotoGrid: photoGridEntry,
  PHOTOGRID: photoGridEntry,
  PHOTO_GRID: photoGridEntry,
  PHOTO_GALLERY: photoGridEntry,
  RSVPConfirmation: rsvpEntry,
  RSVP: rsvpEntry,
  RSVPSection: rsvpEntry,
  RSVP_SECTION: rsvpEntry,
  RSVP_CONFIRMATION: rsvpEntry,
  Agenda: agendaEntry,
  AGENDA: agendaEntry,
  AgendaSection: agendaEntry,
  AGENDA_SECTION: agendaEntry,
  SCHEDULE: agendaEntry,
  MomentWall: momentWallEntry,
  MOMENTWALL: momentWallEntry,
  MOMENT_WALL: momentWallEntry,
  MOMENTS_WALL: momentWallEntry,
  HERO: legacyHeroEntry,
  LegacyHero: legacyHeroEntry,
  LEGACY_HERO: legacyHeroEntry,
  TEXT: legacyTextEntry,
  LegacyText: legacyTextEntry,
  LEGACY_TEXT: legacyTextEntry,
  Contact: legacyTextEntry,
  ContactSection: legacyTextEntry,
  CONTACT_SECTION: legacyTextEntry,
  GALLERY: legacyGalleryEntry,
  LegacyGallery: legacyGalleryEntry,
  LEGACY_GALLERY: legacyGalleryEntry,
  MAP: legacyMapEntry,
  LegacyMap: legacyMapEntry,
  LEGACY_MAP: legacyMapEntry,
  MUSIC: legacyMusicEntry,
  LegacyMusic: legacyMusicEntry,
  LEGACY_MUSIC: legacyMusicEntry,
  LegacySchedule: agendaEntry,
  LEGACY_SCHEDULE: agendaEntry,
} as const;
