// ── Hydration ────────────────────────────────────────────────────────────────

import type { PublicAccessFetchParams } from "../../lib/publicPreview";

export type HydrationMode = "immediate" | "visible";

/**
 * Base props every section component receives from the engine.
 * Individual components narrow `config` to their own typed shape internally.
 */
export interface SectionComponentProps {
  sectionId: string;
  sectionType?: string;
  sectionTitle?: string;
  config: Record<string, unknown>;
  EVENTS_URL: string;
  publicAccess?: PublicAccessFetchParams;
}

// ── Per-section config shapes ─────────────────────────────────────────────────

export interface CountdownHeaderConfig {
  heading: string; // "EL GRAN DÍA"
  targetDate: string; // ISO 8601 — parsed with new Date()
}

export interface GraduationHeroConfig {
  title: string; // "NOS GRADUAMOS"
  years: string; // "2022 - 2025"
  school: string; // "PREPARATORIA"
}

export interface EventVenueConfig {
  text: string; // Main event text paragraph
  date: string; // "este 22 de junio del 2025"
  venueText: string; // Venue name + time
  mapUrl: string; // Google Maps embed URL
}

export interface ReceptionConfig {
  venueText: string; // "posteriormente la recepción será en…"
  mapUrl: string; // Google Maps embed URL
}

export interface GraduatesListConfig {
  /** Names list is now fetched from DB via GET /api/events/section/:sectionId/attendees */
  closing: string; // "celebremos juntos"
}

// PhotoGrid is fully dynamic — no text config needed
export type PhotoGridConfig = Record<string, never>;

export interface RSVPConfirmationConfig {
  /** Injected by backend PageSpecService from EventConfig.DefaultWelcomeMessage */
  welcome_message?: string;
  /** Injected by backend PageSpecService from EventConfig.DefaultThankYouMessage */
  thank_you_message?: string;
  /** Injected by backend PageSpecService from EventConfig.DefaultGuestSignatureTitle */
  guest_signature_title?: string;
}

export interface AgendaItem {
  time: string;
  title: string;
  description?: string;
  icon?:
    | "ceremony"
    | "reception"
    | "dinner"
    | "party"
    | "music"
    | "photo"
    | "default";
  location?: string;
}

export interface AgendaConfig {
  title?: string;
  subtitle?: string;
  /** Legacy SCHEDULE sections used this plain text body instead of items */
  content?: string;
  items: AgendaItem[];
}

export interface MomentWallConfig {
  /** identifier is injected by the backend into the section config */
  identifier: string;
  title?: string;
  subtitle?: string;
  /** Injected by backend PageSpecService from EventConfig.DefaultMomentRequestMessage */
  moment_request_message?: string;
  /** Injected by backend PageSpecService — effective guest upload gate; false once the wall is published */
  allow_uploads?: boolean;
  /** Injected by backend PageSpecService — guests can leave a text note with their upload */
  allow_messages?: boolean;
  /** Injected by backend PageSpecService - uploads skip manual review */
  auto_approve_uploads?: boolean;
  /** Injected by backend PageSpecService — wall is publicly visible */
  published?: boolean;
  /** Canonical backend flag for the public moments wall visibility */
  moments_wall_published?: boolean;
  /** Dashboard/EventConfig visibility alias kept for direct config payloads */
  show_moment_wall?: boolean;
  showMomentWall?: boolean;
  /** Injected by backend PageSpecService — effective shared QR uploads gate */
  share_uploads_enabled?: boolean;
  /** Injected by backend PageSpecService — effective per guest/IP upload limit */
  max_uploads_per_guest?: number;
}

export interface LegacyHeroConfig {
  title?: string;
  subtitle?: string;
  content?: string;
  imageUrl?: string;
}

export interface LegacyTextConfig {
  title?: string;
  content?: string;
}

export interface LegacyGalleryConfig {
  title?: string;
  subtitle?: string;
}

export interface LegacyMapConfig {
  title?: string;
  content?: string;
  mapUrl?: string;
}

export interface LegacyMusicConfig {
  musicUrl?: string;
  audioUrl?: string;
  url?: string;
}

// ── Page spec ─────────────────────────────────────────────────────────────────

export interface SectionSpec {
  type: string;
  title?: string;
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
  /** Changes when access settings change, so stored password verification can expire */
  accessVersion?: string;
  /** True only when the backend validated the signed preview token for this event */
  previewAuthorized?: boolean;
  /** True only when the backend accepted a signed password-access proof */
  passwordVerified?: boolean;
}

export interface PageTheme {
  designTemplateId?: string;
  designTemplateIdentifier?: string;
  colorPaletteId?: string;
  colorPaletteName?: string;
  fontSetId?: string;
  fontSetName?: string;
  colors?: Record<string, string>;
  fonts?: Record<string, string>;
  fontUrls?: Record<string, string>;
  fontViewUrls?: Record<string, string>;
  fontViewUrlsExpiresAt?: string;
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
  /** Raw cover image path or URL from the backend event */
  coverImageUrl?: string;
  /** Expiration for legacy signed coverImageUrl values */
  coverImageUrlExpiresAt?: string;
  /** Signed/display-ready cover URL returned by the backend */
  coverViewUrl?: string;
  /** Expiration for coverViewUrl */
  coverViewUrlExpiresAt?: string;
  /** ISO 8601 event datetime */
  eventDateTime?: string;
  /** Legacy alias accepted by older mocks/cache entries; backend emits eventDateTime. */
  eventDate?: string;
  /** Human-readable event address */
  address?: string;
  /** Optional secondary venue/reception address captured in the dashboard */
  secondAddress?: string;
  /** IANA timezone captured in the dashboard */
  timezone?: string;
  /** Public event language, for localized renderers */
  language?: string;
  /** Backend event type slug/name */
  eventType?: string;
  /** Changes when the public page shape/content changes, used to scope child caches */
  contentVersion?: string;
  /** Access control settings */
  access?: PageAccess;
  /** If false, the public renderer hides the branded footer */
  footerVisible?: boolean;
  /** Effective theme from EventConfig overrides or DesignTemplate defaults */
  theme?: PageTheme;
}

export interface PageSpec {
  meta: PageMeta;
  sections: SectionSpec[];
}
