// ── Hydration ────────────────────────────────────────────────────────────────

export type HydrationMode = 'immediate' | 'visible';

/**
 * Base props every section component receives from the engine.
 * Individual components narrow `config` to their own typed shape internally.
 */
export interface SectionComponentProps {
  sectionId: string;
  config: Record<string, unknown>;
  EVENTS_URL: string;
}

// ── Per-section config shapes ─────────────────────────────────────────────────

export interface CountdownHeaderConfig {
  heading: string;       // "EL GRAN DÍA"
  targetDate: string;    // ISO 8601 — parsed with new Date()
}

export interface GraduationHeroConfig {
  title: string;         // "NOS GRADUAMOS"
  years: string;         // "2022 - 2025"
  school: string;        // "PREPARATORIA"
}

export interface EventVenueConfig {
  text: string;          // Main event text paragraph
  date: string;          // "este 22 de junio del 2025"
  venueText: string;     // Venue name + time
  mapUrl: string;        // Google Maps embed URL
}

export interface ReceptionConfig {
  venueText: string;     // "posteriormente la recepción será en…"
  mapUrl: string;        // Google Maps embed URL
}

export interface GraduatesListConfig {
  /** Names list is now fetched from DB via GET /api/events/section/:sectionId/attendees */
  closing: string;       // "celebremos juntos"
}

// PhotoGrid and RSVPConfirmation are fully dynamic — no text config needed
export type PhotoGridConfig = Record<string, never>;
export type RSVPConfirmationConfig = Record<string, never>;

// ── Page spec ─────────────────────────────────────────────────────────────────

export interface SectionSpec {
  type: string;
  /** Empty string for config-only sections that fetch no API resources */
  sectionId: string;
  order: number;
  config: Record<string, unknown>;
}

export interface PageContact {
  name?: string;
  phone?: string;
  email?: string;
}

export interface PageMeta {
  pageTitle: string;
  /** If present, MusicWidget renders with this URL */
  musicUrl?: string;
  contact?: PageContact;
}

export interface PageSpec {
  meta: PageMeta;
  sections: SectionSpec[];
}
