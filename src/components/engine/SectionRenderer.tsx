"use client";

import { useEffect, useRef, useState, type ComponentType } from 'react';
import { resolveSectionRegistryEntry } from './registry';
import SectionErrorBoundary from './SectionErrorBoundary';
import type { SectionSpec, SectionComponentProps } from './types';
import type { PublicAccessFetchParams } from '../../lib/publicPreview';

interface Props {
  spec: SectionSpec;
  EVENTS_URL: string;
  publicAccess?: PublicAccessFetchParams;
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
export default function SectionRenderer({ spec, EVENTS_URL, publicAccess }: Props) {
  const entry = resolveSectionRegistryEntry(spec.type);
  const [Component, setComponent] = useState<ComponentType<SectionComponentProps> | null>(null);
  const [inView, setInView] = useState(entry?.hydration === 'immediate');
  const [loadError, setLoadError] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setComponent(null);
    setLoadError(false);
    setInView(entry?.hydration === 'immediate');
  }, [entry, spec.type]);

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
    let cancelled = false;
    setLoadError(false);
    entry
      .loader()
      .then((mod) => {
        if (!cancelled) setComponent(() => mod.default);
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [inView, entry, Component, loadAttempt]);

  if (!entry) {
    if (import.meta.env.DEV) {
      console.warn(`[EventPage] Unknown section type: "${spec.type}". Register it in engine/registry.ts.`);
    }
    return null;
  }

  if (!Component) {
    if (loadError) {
      return (
        <div
          className="eventi-product-card mx-auto flex min-h-48 w-full max-w-xl flex-col items-center justify-center px-6 py-8 text-center"
          data-section-type={spec.type}
          role="status"
        >
          <p className="text-sm font-semibold text-gray-900">No pudimos mostrar esta sección</p>
          <p className="mt-1 text-xs leading-5 text-gray-500">El resto de la invitación sigue disponible.</p>
          <button
            type="button"
            onClick={() => setLoadAttempt((attempt) => attempt + 1)}
            className="mt-4 min-h-11 rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 transition hover:border-gray-300 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500/35"
          >
            Reintentar sección
          </button>
        </div>
      );
    }
    return (
      <div
        ref={sentinelRef}
        className="eventi-skeleton h-64 w-full rounded-[2rem]"
        data-section-type={spec.type}
        aria-hidden="true"
      />
    );
  }

  return (
    <div
      id={`section-${spec.sectionId}`}
      className="eventi-section scroll-mt-8"
      data-section-type={spec.type}
    >
      <SectionErrorBoundary sectionType={spec.type}>
        <Component
          sectionId={spec.sectionId}
          sectionType={spec.type}
          sectionTitle={spec.title}
          config={spec.config}
          EVENTS_URL={EVENTS_URL}
          publicAccess={publicAccess}
        />
      </SectionErrorBoundary>
    </div>
  );
}
