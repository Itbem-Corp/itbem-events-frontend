"use client";

import { useState, useEffect, useCallback } from 'react';
import SectionRenderer from './SectionRenderer';
import MusicWidget from '../MusicWidget';
import ShareWidget from '../ShareWidget';
import Footer from '../common/Footer';
import InstallPrompt from '../InstallPrompt';
import type { PageSpec } from './types';

interface Props {
  EVENTS_URL: string;
  /** When set, loads page-spec by event identifier instead of ?token= query param. */
  identifier?: string;
  /** When set, opens in RSVP mode — auto-scrolls to the RSVPConfirmation section. */
  rsvpMode?: boolean;
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

// ── View Tracking ────────────────────────────────────────────────────────────
// Fires once per session per event. Uses sessionStorage so returning to the
// same tab within the session doesn't double-count.

function trackView(eventsUrl: string, identifier: string) {
  const key = `view-tracked-${identifier}`;
  if (sessionStorage.getItem(key)) return; // already counted this session
  try { sessionStorage.setItem(key, '1'); } catch { /* ignore */ }
  // Fire-and-forget — never block the page
  fetch(`${eventsUrl}api/events/${encodeURIComponent(identifier)}/view`, {
    method: 'POST',
    keepalive: true,
  }).catch(() => { /* ignore network errors */ });
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

// ── Date Gate ─────────────────────────────────────────────────────────────────

function ComingSoonGate({ activeFrom }: { activeFrom: string }) {
  const date = new Date(activeFrom);
  const formatted = date.toLocaleDateString('es-MX', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit', timeZoneName: 'short',
  });
  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-4 text-center space-y-6 bg-white">
      <div className="text-6xl">🗓️</div>
      <h1 className="text-2xl font-semibold text-gray-800">Esta invitación aún no está disponible</h1>
      <p className="text-gray-500 max-w-sm">
        La página estará disponible el <strong>{formatted}</strong>.
        <br />Guarda este enlace y vuelve entonces.
      </p>
    </main>
  );
}

function EventEndedGate({ activeUntil }: { activeUntil: string }) {
  const date = new Date(activeUntil);
  const formatted = date.toLocaleDateString('es-MX', {
    year: 'numeric', month: 'long', day: 'numeric',
  });
  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-4 text-center space-y-6 bg-white">
      <div className="text-6xl">✨</div>
      <h1 className="text-2xl font-semibold text-gray-800">¡El evento ya concluyó!</h1>
      <p className="text-gray-500 max-w-sm">
        Esta página estuvo disponible hasta el <strong>{formatted}</strong>.
        <br />Gracias por haber sido parte de este momento especial.
      </p>
    </main>
  );
}

// ── Password Gate ─────────────────────────────────────────────────────────────

function PasswordGate({
  eventsUrl,
  identifier,
  onSuccess,
}: {
  eventsUrl: string;
  identifier: string;
  onSuccess: () => void;
}) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const verify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch(
        `${eventsUrl}api/events/${encodeURIComponent(identifier)}/verify-access`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password }),
        }
      );
      if (res.ok) {
        try { sessionStorage.setItem(`event-verified-${identifier}`, '1'); } catch { /* ignore */ }
        onSuccess();
      } else {
        setError('Contraseña incorrecta. Intenta de nuevo.');
      }
    } catch {
      setError('Error al verificar. Intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-4 bg-white">
      <form onSubmit={verify} className="w-full max-w-xs space-y-5 text-center">
        <div className="text-5xl">🔒</div>
        <h1 className="text-xl font-semibold text-gray-800">Esta invitación es privada</h1>
        <p className="text-gray-500 text-sm">Ingresa la contraseña que recibiste junto con tu invitación.</p>
        <input
          type="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          placeholder="Contraseña"
          autoFocus
          required
          className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
        />
        {error && <p className="text-red-500 text-xs">{error}</p>}
        <button
          type="submit"
          disabled={loading || !password}
          className="w-full bg-gray-900 text-white rounded-lg px-4 py-2.5 text-sm font-medium disabled:opacity-50 hover:bg-gray-700 transition-colors"
        >
          {loading ? 'Verificando…' : 'Acceder'}
        </button>
      </form>
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
 * 6. After load: tracks view (once per session) + enforces date/password gates.
 */
export default function EventPage({ EVENTS_URL: rawEventsUrl, identifier: identifierProp, rsvpMode }: Props) {
  // Normalize: ensure trailing slash so `${EVENTS_URL}api/...` always produces a valid URL.
  const EVENTS_URL = rawEventsUrl.endsWith('/') ? rawEventsUrl : rawEventsUrl + '/';
  const [spec, setSpec] = useState<PageSpec | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [passwordVerified, setPasswordVerified] = useState(false);

  // Dashboard Studio sends ?preview=1 — skip tracking, cache, and gates.
  const [isPreview, setIsPreview] = useState(false);

  const loadSpec = useCallback(async (tok: string, byIdentifier = false, skipCache = false) => {
    setError(null);

    // Cache hit — render immediately (skip in preview mode)
    if (!skipCache) {
      const cached = readSpecCache(tok);
      if (cached) {
        if (cached.meta?.pageTitle) document.title = cached.meta.pageTitle;
        setSpec(cached);
        return;
      }
    }

    // Cache miss (or preview mode) — fetch with retry
    try {
      const url = byIdentifier
        ? `${EVENTS_URL}api/events/${encodeURIComponent(tok)}/page-spec`
        : `${EVENTS_URL}api/events/page-spec?token=${encodeURIComponent(tok)}`;
      const res = await fetchWithRetry(url);
      if (res.status === 404) {
        setError(byIdentifier
          ? 'Evento no encontrado. Verifica el enlace.'
          : 'Invitación no encontrada. Verifica el enlace que recibiste.');
        return;
      }
      if (!res.ok) throw new Error(`Error del servidor (${res.status})`);

      const json = await res.json();
      const pageSpec: PageSpec = json.data;
      if (pageSpec?.meta?.pageTitle) document.title = pageSpec.meta.pageTitle;
      if (!skipCache) writeSpecCache(tok, pageSpec);
      setSpec(pageSpec);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar la invitación.');
    }
  }, [EVENTS_URL]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const preview = params.get('preview') === '1';
    setIsPreview(preview);

    // Identifier mode — load by event slug directly
    if (identifierProp) {
      setToken(identifierProp);
      loadSpec(identifierProp, true, preview);
      return;
    }

    // Token mode — read from query string
    const tok = params.get('token');
    if (!tok) {
      setError('Token requerido. Verifica el enlace de tu invitación.');
      return;
    }
    setToken(tok);
    loadSpec(tok, false, preview);
  }, [loadSpec, identifierProp]);

  // Track view + restore password verification after spec loads
  useEffect(() => {
    if (!spec?.meta?.identifier) return;

    const id = spec.meta.identifier;

    // Restore verified state from sessionStorage
    try {
      if (sessionStorage.getItem(`event-verified-${id}`) === '1') {
        setPasswordVerified(true);
      }
    } catch { /* ignore */ }

    // Track view (fire-and-forget, once per session) — skip in preview mode
    if (!isPreview) trackView(EVENTS_URL, id);
  }, [spec?.meta?.identifier, EVENTS_URL, isPreview]);

  // RSVP mode — auto-scroll to the RSVPConfirmation section after render
  useEffect(() => {
    if (!rsvpMode || !spec) return;
    const rsvpSection = spec.sections.find(s => s.type === 'RSVPConfirmation');
    if (!rsvpSection) return;
    // Wait for section to render + hydrate
    const timer = setTimeout(() => {
      const el = document.getElementById(`section-${rsvpSection.sectionId}`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 800);
    return () => clearTimeout(timer);
  }, [rsvpMode, spec]);

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

  // Preview mode (dashboard Studio) — bypass all gates
  if (!isPreview) {
    const { access } = spec.meta;
    const now = new Date();

    // Date gate: coming soon
    if (access?.activeFrom) {
      const from = new Date(access.activeFrom);
      if (now < from) return <ComingSoonGate activeFrom={access.activeFrom} />;
    }

    // Date gate: event ended
    if (access?.activeUntil) {
      const until = new Date(access.activeUntil);
      if (now > until) return <EventEndedGate activeUntil={access.activeUntil} />;
    }

    // Password gate
    if (access?.passwordProtected && !passwordVerified && spec.meta.identifier) {
      return (
        <PasswordGate
          eventsUrl={EVENTS_URL}
          identifier={spec.meta.identifier}
          onSuccess={() => setPasswordVerified(true)}
        />
      );
    }
  }

  const sorted = [...spec.sections].sort((a, b) => a.order - b.order);

  return (
    <>
      {spec.meta.musicUrl && (
        <MusicWidget audioUrl={spec.meta.musicUrl} volume={0.3} />
      )}

      <ShareWidget eventTitle={spec.meta.pageTitle} />

      <main className="max-w-screen-md lg:max-w-[1024px] mx-auto px-3 sm:px-4 py-2 space-y-12 sm:space-y-20 overflow-x-hidden">
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

      <InstallPrompt />
    </>
  );
}
