// tests/fixtures/api-data.ts
// Typed constants mirroring the real API shape.
// Any typo in a section ID surfaces as a TypeScript error, not a silent test pass.

export const SECTION_IDS = {
  graduation: {
    s1: '76a8d7d9-d83f-472b-9fcb-a75e96b6bcc5', // GraduationHero
    s2: '78acb1bb-bbc8-44de-afc9-a79eb22de2db', // EventVenue (church)
    s3: 'dc87ac12-7ca1-4aca-9e07-02b687c4ecb1', // Reception (hotel)
    s4: 'af03cf82-72d3-4d8c-8838-4cfcc6bf287b', // GraduatesList + banner
    s5: '61202ab3-adaf-405f-8ff4-7bc75d1afc52', // PhotoGrid
  },
  wedding: {
    s1: '8c1600fd-f6d3-494c-9542-2dc4a0897954', // RSVPConfirmation
  },
} as const;

// Tokens used in test URLs
export const TEST_TOKENS = {
  graduation: 'test-graduation-token',
  wedding:    'test-token-abc',
} as const;

// Test attendees returned by GET /api/events/section/:id/attendees
export const TEST_GRADUATION_ATTENDEES = [
  { first_name: 'Ana Gloria',  last_name: 'Vásquez Velázquez', nickname: '', role: 'Graduado', order: 1 },
  { first_name: 'Valeria',     last_name: 'Trujillo Iniesta',  nickname: '', role: 'Graduado', order: 2 },
  { first_name: 'Carlos',      last_name: 'Mendoza Ruiz',      nickname: '', role: 'Graduado', order: 3 },
] as const;

// ── Presigned URL factory ─────────────────────────────────────────────────────

// Fake-but-parseable S3 presigned URL. ResourcesBySectionSingle uses
// X-Amz-Date + X-Amz-Expires to compute cache TTL. Date set to 2026-03-01
// with 6h expiry — will not expire during any test run.
function makePresignedUrl(filename: string): string {
  return (
    `https://itbem-events-bucket-prod.s3.us-east-2.amazonaws.com/test/${filename}` +
    `?X-Amz-Algorithm=AWS4-HMAC-SHA256` +
    `&X-Amz-Date=20260301T000000Z` +
    `&X-Amz-Expires=21600` +
    `&X-Amz-SignedHeaders=host` +
    `&X-Amz-Signature=fakesig0000`
  );
}

// ── Section resources factory ─────────────────────────────────────────────────

export function makeSectionResponse(sectionId: string, resourceCount = 2) {
  return {
    data: Array.from({ length: resourceCount }, (_, i) => ({
      view_url: makePresignedUrl(`${sectionId.slice(0, 8)}-img-${i}.jpg`),
      title: `Test image ${i + 1}`,
      position: i,
    })),
  };
}

// ── Page spec factory ─────────────────────────────────────────────────────────

export function makeGraduationPageSpec() {
  return {
    data: {
      meta: {
        pageTitle: 'Nos Graduamos 2022-2025 | El Gran Día',
        // Use an S3 URL so mockS3Images intercepts it (returns 404 silently) — Howler
        // will fail to load audio but the MusicWidget button still renders in tests.
        musicUrl: 'https://itbem-events-bucket-prod.s3.us-east-2.amazonaws.com/test/graduation-music.mp3',
        contact: {
          phone: '9999988610',
          email: 'contacto.eventiapp@itbem.com',
        },
      },
      sections: [
        {
          type: 'CountdownHeader',
          sectionId: 'countdown-test-0000000000001',
          order: 0,
          config: { heading: 'EL GRAN DÍA', targetDate: '2025-06-22T20:30:00-06:00' },
        },
        {
          type: 'GraduationHero',
          sectionId: SECTION_IDS.graduation.s1,
          order: 1,
          config: { title: 'NOS GRADUAMOS', years: '2022 - 2025', school: 'PREPARATORIA' },
        },
        {
          type: 'EventVenue',
          sectionId: SECTION_IDS.graduation.s2,
          order: 2,
          config: {
            text: 'Tienes una invitación especial a la misa de graduación.',
            date: 'este 22 de junio del 2025',
            venueText: 'Santuario la Villita de Guadalupe',
            mapUrl: 'https://www.google.com/maps/embed?pb=test',
          },
        },
        {
          type: 'Reception',
          sectionId: SECTION_IDS.graduation.s3,
          order: 3,
          config: {
            venueText: 'Holiday Inn Express Reforma | Salón Barista',
            mapUrl: 'https://www.google.com/maps/embed?pb=test2',
          },
        },
        {
          type: 'GraduatesList',
          sectionId: SECTION_IDS.graduation.s4,
          order: 4,
          config: { closing: 'celebremos juntos' },
        },
        {
          type: 'PhotoGrid',
          sectionId: SECTION_IDS.graduation.s5,
          order: 5,
          config: {},
        },
      ],
    },
  };
}

export function makeWeddingPageSpec() {
  return {
    data: {
      meta: { pageTitle: 'Andrés & Ivanna', musicUrl: '' },
      sections: [
        {
          type: 'RSVPConfirmation',
          sectionId: SECTION_IDS.wedding.s1,
          order: 1,
          config: {},
        },
      ],
    },
  };
}

// ── Invitation factory ────────────────────────────────────────────────────────

export function makeInvitationResponse(overrides: {
  status?: string;
  maxGuests?: number;
  prettyToken?: string;
  eventDate?: string;
} = {}) {
  return {
    data: {
      pretty_token: overrides.prettyToken ?? 'ABC-123',
      invitation: {
        ID: 'inv-test-001',
        EventID: 'evt-test-001',
        max_guests: overrides.maxGuests ?? 3,
        Event: {
          EventDateTime: overrides.eventDate ?? '2026-08-15T20:30:00-06:00',
        },
      },
      guest: {
        first_name: 'Ana',
        last_name: 'García',
        rsvp_status: overrides.status ?? '',
      },
    },
  };
}

export const RSVP_SUCCESS = { data: { message: 'RSVP updated' } };


// -- MomentWall fixtures --

export const MOMENT_EVENT_IDENTIFIER = 'test-momento-event';

export function makeMoment(overrides: Partial<{
  id: string;
  content_url: string;
  description: string;
  created_at: string;
}> = {}) {
  return {
    id: overrides.id ?? 'moment-test-001',
    content_url: overrides.content_url ?? 'moments/test-momento-event/img-001.webp',
    description: overrides.description ?? 'Un momento especial',
    created_at: overrides.created_at ?? '2026-02-21T12:00:00Z',
    processing_status: 'done',
  };
}

export function makeMomentsResponse(overrides: {
  items?: ReturnType<typeof makeMoment>[];
  total?: number;
  has_more?: boolean;
  uploads_remaining?: number;
} = {}) {
  const items = overrides.items ?? [];
  return {
    data: {
      items,
      total: overrides.total ?? items.length,
      page: 1,
      limit: 20,
      has_more: overrides.has_more ?? false,
      published: true,
      uploads_remaining: overrides.uploads_remaining ?? 3,
      uploads_used: 0,
    },
  };
}

export function makeMomentWallPageSpec(identifier = MOMENT_EVENT_IDENTIFIER) {
  return {
    data: {
      meta: { pageTitle: 'Momentos del Evento', musicUrl: '' },
      sections: [
        {
          type: 'MomentWall',
          sectionId: 'moment-wall-section-test-0001',
          order: 0,
          config: {
            identifier,
            title: 'Momentos',
            subtitle: 'Comparte tus fotos favoritas',
          },
        },
      ],
    },
  };
}
