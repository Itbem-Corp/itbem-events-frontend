"use client";

import { useState, useEffect, useCallback } from 'react';
import SectionRenderer from './SectionRenderer';
import MusicWidget from '../MusicWidget';
import Footer from '../common/Footer';
import type { PageSpec } from './types';

interface Props {
  EVENTS_URL: string;
}

// ── Cache ────────────────────────────────────────────────────────────────────

const SPEC_TTL_MS = 30 * 60 * 1000; // 30 minutes

function readSpecCache(token: string): PageSpec | null {
  try {
    const raw = sessionStorage.getItem(`pageSpec-${token}`);
    if (!raw) return null;
    const { spec, ts } = JSON.parse(raw) as { spec: PageSpec; ts: number };
    if (Date.now() - ts > SPEC_TTL_MS) {
      sessionStorage.removeItem(`pageSpec-${token}`);
      return null;
    }
    return spec;
  } catch {
    return null;
  }
}

function writeSpecCache(token: string, spec: PageSpec) {
  try {
    sessionStorage.setItem(`pageSpec-${token}`, JSON.stringify({ spec, ts: Date.now() }));
  } catch {
    // sessionStorage full or unavailable — skip silently
  }
}

// ── Fetch with retry ─────────────────────────────────────────────────────────

async function fetchWithRetry(url: string, retries = 3): Promise<Response> {
  for (let i = 0; i < retries; i++) {
    const res = await fetch(url);
    // 404 = invalid token — don't retry, fail fast
    if (res.ok || res.status === 404) return res;
    if (i < retries - 1) {
      await new Promise(r => setTimeout(r, 500 * (i + 1))); // 500ms, 1000ms, 1500ms
    }
  }
  throw new Error('No se pudo conectar. Verifica tu conexión e intenta de nuevo.');
}

// ── Skeleton ─────────────────────────────────────────────────────────────────

function PageSkeleton() {
  return (
    <main className="max-w-screen-md lg:max-w-[1024px] mx-auto px-4 py-2 space-y-20 animate-pulse">
      <div className="h-64 bg-gray-100 rounded-lg" />
      <div className="h-80 bg-gray-100 rounded-lg" />
      <div className="h-64 bg-gray-100 rounded-lg" />
    </main>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * Root event page renderer — Phase 2 (SDUI dynamic).
 *
 * 1. Reads ?token= from the URL.
 * 2. Checks sessionStorage cache (30 min TTL) — instant render on return visits.
 * 3. If no cache: fetches GET {EVENTS_URL}api/events/page-spec?token=...
 *    with up to 3 retries (500ms / 1000ms / 1500ms linear backoff).
 *    404 responses are not retried (invalid token).
 * 4. Stores result in cache, then renders sections via SectionRenderer.
 * 5. Each section is wrapped in SectionErrorBoundary.
 */
export default function EventPage({ EVENTS_URL }: Props) {
  const [spec, setSpec] = useState<PageSpec | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);

  const loadSpec = useCallback(async (tok: string) => {
    setError(null);

    // Cache hit — render immediately
    const cached = readSpecCache(tok);
    if (cached) {
      if (cached.meta?.pageTitle) document.title = cached.meta.pageTitle;
      setSpec(cached);
      return;
    }

    // Cache miss — fetch with retry
    try {
      const res = await fetchWithRetry(
        `${EVENTS_URL}api/events/page-spec?token=${encodeURIComponent(tok)}`
      );
      if (res.status === 404) {
        setError('Invitación no encontrada. Verifica el enlace que recibiste.');
        return;
      }
      if (!res.ok) throw new Error(`Error del servidor (${res.status})`);

      const json = await res.json();
      const pageSpec: PageSpec = json.data;
      if (pageSpec?.meta?.pageTitle) document.title = pageSpec.meta.pageTitle;
      writeSpecCache(tok, pageSpec);
      setSpec(pageSpec);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar la invitación.');
    }
  }, [EVENTS_URL]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tok = params.get('token');
    if (!tok) {
      setError('Token requerido. Verifica el enlace de tu invitación.');
      return;
    }
    setToken(tok);
    loadSpec(tok);
  }, [loadSpec]);

  if (error) {
    return (
      <main className="max-w-screen-md mx-auto px-4 py-20 text-center space-y-4">
        <p className="text-red-500 text-sm">{error}</p>
        {token && (
          <button
            onClick={() => loadSpec(token)}
            className="text-xs underline text-gray-500 hover:text-gray-700"
          >
            Reintentar
          </button>
        )}
      </main>
    );
  }

  if (!spec) return <PageSkeleton />;

  const sorted = [...spec.sections].sort((a, b) => a.order - b.order);

  return (
    <>
      {spec.meta.musicUrl && (
        <MusicWidget audioUrl={spec.meta.musicUrl} volume={0.3} />
      )}

      <main className="max-w-screen-md lg:max-w-[1024px] mx-auto px-4 py-2 space-y-20">
        {sorted.map(section => (
          <SectionRenderer
            key={section.sectionId || `${section.type}-${section.order}`}
            spec={section}
            EVENTS_URL={EVENTS_URL}
          />
        ))}

        <div className="overflow-x-hidden">
          <Footer contact={spec.meta.contact} />
        </div>
      </main>
    </>
  );
}
