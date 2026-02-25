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

export interface AgendaItem {
  time: string
  title: string
  description?: string
  icon?: 'ceremony' | 'reception' | 'dinner' | 'party' | 'music' | 'photo' | 'default'
  location?: string
}

export interface AgendaConfig {
  title?: string
  subtitle?: string
  items: AgendaItem[]
}

export interface MomentWallConfig {
  /** identifier is injected by the backend into the section config */
  identifier: string;
  title?: string;
  subtitle?: string;
  /** Injected by backend PageSpecService — guests can upload photos/videos */
  allow_uploads?: boolean;
  /** Injected by backend PageSpecService — guests can leave a text note with their upload */
  allow_messages?: boolean;
  /** Injected by backend PageSpecService — wall is publicly visible */
  published?: boolean;
  /** Injected by backend PageSpecService — shared QR uploads enabled (no personal token needed) */
  share_uploads_enabled?: boolean;
}

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

export interface PageAccess {
  /** ISO 8601 — page is not visible before this datetime */
  activeFrom?: string;
  /** ISO 8601 — page is not visible after this datetime */
  activeUntil?: string;
  /** If true, the guest must enter a password before seeing the page */
  passwordProtected: boolean;
}

export interface PageMeta {
  pageTitle: string;
  /** If present, MusicWidget renders with this URL */
  musicUrl?: string;
  contact?: PageContact;
  /** Backend event UUID */
  eventId?: string;
  /** Human-readable event identifier */
  identifier?: string;
  /** Access control settings */
  access?: PageAccess;
}

export interface PageSpec {
  meta: PageMeta;
  sections: SectionSpec[];
}
