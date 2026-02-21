import type { ComponentType } from 'react';
import type { HydrationMode, SectionComponentProps } from './types';

export interface RegistryEntry {
  /** Dynamic import — section JS is only fetched when needed */
  loader: () => Promise<{ default: ComponentType<SectionComponentProps> }>;
  hydration: HydrationMode;
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
  CountdownHeader: {
    loader: () => import('../sections/CountdownHeader'),
    hydration: 'immediate',
  },
  GraduationHero: {
    loader: () => import('../sections/GraduationHero'),
    hydration: 'immediate',
  },
  EventVenue: {
    loader: () => import('../sections/EventVenue'),
    hydration: 'visible',
  },
  Reception: {
    loader: () => import('../sections/Reception'),
    hydration: 'visible',
  },
  GraduatesList: {
    loader: () => import('../sections/GraduatesList'),
    hydration: 'visible',
  },
  PhotoGrid: {
    loader: () => import('../sections/PhotoGrid'),
    hydration: 'visible',
  },
  RSVPConfirmation: {
    loader: () => import('../sections/RSVPConfirmation'),
    hydration: 'immediate',
  },
  Agenda: {
    loader: () => import('../sections/AgendaSection'),
    hydration: 'visible',
  },
  MomentWall: {
    loader: () => import('../sections/MomentWall'),
    hydration: 'visible',
  },
} as const;
