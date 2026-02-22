"use client";

import { useEffect, useRef, useState, type ComponentType } from 'react';
import { SECTION_REGISTRY } from './registry';
import SectionErrorBoundary from './SectionErrorBoundary';
import type { SectionSpec, SectionComponentProps } from './types';

interface Props {
  spec: SectionSpec;
  EVENTS_URL: string;
}

/**
 * Renders a single section from the PageSpec.
 *
 * - 'immediate' sections: load their JS right away (above-the-fold, forms)
 * - 'visible' sections: defer JS load until the section enters the viewport
 *   using IntersectionObserver (rootMargin: 150px for early pre-load)
 *
 * While the component JS is loading, a generic pulse placeholder is shown.
 * Once loaded, the component manages its own data-loading skeleton internally
 * via AnimatePresence.
 *
 * Each section is wrapped in a SectionErrorBoundary so a runtime crash in one
 * section renders nothing for that section without taking down the whole page.
 */
export default function SectionRenderer({ spec, EVENTS_URL }: Props) {
  const entry = SECTION_REGISTRY[spec.type];
  const [Component, setComponent] = useState<ComponentType<SectionComponentProps> | null>(null);
  const [inView, setInView] = useState(entry?.hydration === 'immediate');
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Watch for the section approaching the viewport (only for 'visible' sections)
  useEffect(() => {
    if (inView || !sentinelRef.current) return;

    const observer = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) setInView(true); },
      { rootMargin: '150px' },
    );
    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [inView]);

  // Lazy-import the section component once it should be visible
  useEffect(() => {
    if (!inView || !entry || Component) return;
    entry.loader().then(mod => setComponent(() => mod.default));
  }, [inView, entry, Component]);

  if (!entry) {
    if (import.meta.env.DEV) {
      console.warn(`[EventPage] Unknown section type: "${spec.type}". Register it in engine/registry.ts.`);
    }
    return null;
  }

  if (!Component) {
    return (
      <div
        ref={sentinelRef}
        className="animate-pulse bg-gray-100 rounded h-64 w-full"
        aria-hidden="true"
      />
    );
  }

  return (
    <div id={`section-${spec.sectionId}`}>
      <SectionErrorBoundary sectionType={spec.type}>
        <Component
          sectionId={spec.sectionId}
          config={spec.config}
          EVENTS_URL={EVENTS_URL}
        />
      </SectionErrorBoundary>
    </div>
  );
}
