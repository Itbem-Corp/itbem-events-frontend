'use client';

/**
 * Smart PWA install prompt.
 *
 * Android Chrome: intercepts `beforeinstallprompt`, shows custom banner after 3s.
 * iOS Safari:     detects iOS + non-standalone → shows "Add to Home Screen" instructions.
 * Already installed (standalone): renders nothing.
 * Dismissed: hidden for 7 days (localStorage).
 *
 * Only mounts inside EventPage (invitation pages) — never on root /
 * or other utility pages.
 */

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// BeforeInstallPromptEvent is not in standard TypeScript DOM lib yet.
interface BeforeInstallPromptEvent extends Event {
  readonly platforms: ReadonlyArray<string>;
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
  prompt(): Promise<void>;
}

const DISMISS_KEY = 'pwa-install-dismissed';
const COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// ── Platform detection helpers ─────────────────────────────────────────────

function detectPlatform(): 'android' | 'ios' | 'other' {
  if (typeof navigator === 'undefined') return 'other';
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua) && !(window as Window & { MSStream?: unknown }).MSStream) {
    return 'ios';
  }
  // Android Chrome (not Firefox/Samsung — those fire beforeinstallprompt anyway)
  return 'android';
}

function isInStandaloneMode(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isPreviewMode(): boolean {
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).get('preview') === '1';
}

function isDismissedRecently(): boolean {
  try {
    const ts = localStorage.getItem(DISMISS_KEY);
    if (!ts) return false;
    return Date.now() - Number(ts) < COOLDOWN_MS;
  } catch {
    return false;
  }
}

function markDismissed(): void {
  try {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
  } catch { /* storage unavailable — ignore */ }
}

// ── iOS instructions sub-component ────────────────────────────────────────

function IOSInstructions() {
  return (
    <div className="mt-4 rounded-2xl p-4 space-y-2.5" style={{ background: 'rgba(0,0,0,0.04)' }}>
      <p className="flex items-center gap-2.5 text-xs text-gray-600 leading-snug">
        <span className="text-lg select-none">1</span>
        <span>
          Toca el botón{' '}
          <span
            className="inline-flex items-center justify-center w-7 h-7 rounded-lg border border-gray-200 bg-white shadow-sm align-middle mx-0.5"
          >
            {/* iOS share icon */}
            <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="#007aff" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8" />
              <polyline points="16 6 12 2 8 6" />
              <line x1="12" y1="2" x2="12" y2="15" />
            </svg>
          </span>{' '}
          en Safari
        </span>
      </p>
      <p className="flex items-center gap-2.5 text-xs text-gray-600 leading-snug">
        <span className="text-lg select-none">2</span>
        <span>
          Elige <strong className="font-semibold text-gray-800">"Agregar a pantalla de inicio"</strong>
        </span>
      </p>
      <p className="flex items-center gap-2.5 text-xs text-gray-600 leading-snug">
        <span className="text-lg select-none">3</span>
        <span>Toca <strong className="font-semibold text-gray-800">"Agregar"</strong> para confirmar</span>
      </p>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────

export default function InstallPrompt() {
  const [show, setShow] = useState(false);
  const [platform, setPlatform] = useState<'android' | 'ios' | null>(null);
  const deferredPromptRef = useRef<BeforeInstallPromptEvent | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Guard: skip in preview mode, already installed, or dismissed recently
    if (isPreviewMode() || isInStandaloneMode() || isDismissedRecently()) return;

    const detected = detectPlatform();

    if (detected === 'ios') {
      // iOS: Safari doesn't fire beforeinstallprompt.
      // Show instructions after a 3.5s delay (let user read the invitation first).
      setPlatform('ios');
      timerRef.current = setTimeout(() => setShow(true), 3500);
      return;
    }

    // Android / Chrome / Edge: wait for the browser's install event.
    const handler = (e: Event) => {
      e.preventDefault(); // suppress browser's default mini-infobar
      deferredPromptRef.current = e as BeforeInstallPromptEvent;
      setPlatform('android');
      timerRef.current = setTimeout(() => setShow(true), 3000);
    };

    window.addEventListener('beforeinstallprompt', handler);

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleInstall = async () => {
    if (!deferredPromptRef.current) return;
    try {
      await deferredPromptRef.current.prompt();
      const { outcome } = await deferredPromptRef.current.userChoice;
      if (outcome === 'dismissed') markDismissed();
      // 'accepted' — no need to dismiss-mark, they installed it
    } catch {
      // Prompt already used or browser rejected — ignore
    }
    deferredPromptRef.current = null;
    setShow(false);
  };

  const handleDismiss = () => {
    markDismissed();
    setShow(false);
    if (timerRef.current) clearTimeout(timerRef.current);
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <AnimatePresence>
      {show && platform && (
        <motion.div
          initial={{ y: '100%', opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: '100%', opacity: 0 }}
          transition={{ type: 'spring', stiffness: 320, damping: 32 }}
          // env(safe-area-inset-bottom) keeps the banner above iPhone home indicator
          className="fixed bottom-0 left-0 right-0 z-50 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
          role="dialog"
          aria-modal="true"
          aria-label={platform === 'android' ? 'Instalar EventiApp' : 'Agregar a pantalla de inicio'}
        >
          <div className="mx-auto max-w-sm rounded-3xl bg-white shadow-2xl overflow-hidden ring-1 ring-black/5">
            {/* Pink gradient header stripe */}
            <div
              className="h-1 w-full"
              style={{ background: 'linear-gradient(90deg, #dd2284, #ff6bb5)' }}
              aria-hidden="true"
            />

            <div className="p-5">
              {/* App identity row */}
              <div className="flex items-start gap-4">
                {/* Icon */}
                <div
                  className="w-14 h-14 rounded-2xl flex-shrink-0 flex items-center justify-center shadow-md"
                  style={{ background: '#dd2284' }}
                  aria-hidden="true"
                >
                  <img src="/favicon.svg" alt="" className="w-9 h-9" loading="lazy" decoding="async" />
                </div>

                {/* Text */}
                <div className="flex-1 min-w-0 pt-0.5">
                  <p className="font-bold text-gray-900 text-sm">EventiApp</p>
                  <p className="text-xs text-gray-400 mt-0.5">Tu invitación digital</p>
                  <p className="text-xs text-gray-600 mt-2 leading-relaxed">
                    {platform === 'android'
                      ? 'Instala la app y ve tu invitación aunque no tengas señal.'
                      : 'Agrégala a tu pantalla de inicio para verla sin conexión.'}
                  </p>
                </div>

                {/* Close button */}
                <button
                  onClick={handleDismiss}
                  className="flex-shrink-0 p-1 -mr-1 -mt-1 text-gray-400 hover:text-gray-600 transition-colors rounded-full"
                  aria-label="Cerrar"
                  type="button"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Android CTA */}
              {platform === 'android' && (
                <button
                  onClick={handleInstall}
                  className="mt-4 w-full py-3.5 rounded-2xl text-white text-sm font-semibold shadow-sm transition-transform active:scale-[0.98]"
                  style={{ background: '#dd2284' }}
                  type="button"
                >
                  Instalar app
                </button>
              )}

              {/* iOS instructions */}
              {platform === 'ios' && <IOSInstructions />}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
