"use client";

import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
} from "react";
import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import { QRCodeSVG } from "qrcode.react";
import PublicEventPasswordGate from "../common/PublicEventPasswordGate";
import { usePublicEventAccess } from "../../hooks/usePublicEventAccess";
import { normalizeEventsUrl } from "../../lib/eventsUrl";
import { buildEventMomentsUrl } from "../../lib/apiUrls";
import { fetchApiData } from "../../lib/apiFetch";
import { extractPathIdentifier } from "../../lib/pathIdentifier";
import {
  publicAccessFetchInit,
  publicAccessQueryParams,
  resolvePublicAccessParams,
  type PublicAccessFetchParams,
} from "../../lib/publicPreview";
import { isVideoMedia, resolvePublicMediaUrl } from "../../lib/mediaUrl";
import { buildSharedUploadPageUrl } from "../../lib/sharedUploadIdentifier";
import {
  getPublicMomentsRefreshDelay,
  normalizePublicMomentsPage,
  publicMomentContentUrl,
  publicMomentsMediaRefreshKey,
  publicMomentPreviewUrl,
  type PublicMoment,
} from "../../lib/publicMoments";

// ── Types ────────────────────────────────────────────────────────────────────

type Slide = PublicMoment;

interface Props {
  EVENTS_URL: string;
  previewToken?: string;
  publicAccess?: PublicAccessFetchParams;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function getIdentifier(): string {
  if (typeof window === "undefined") return "";
  return extractPathIdentifier(window.location.pathname, /\/e\/([^/]+)\/tv/);
}

function getPublicAppBaseUrl(): string {
  if (typeof window === "undefined") return "";
  const match = window.location.pathname.match(/^(.*?)\/e\/[^/]+\/tv\/?$/);
  const basePath = match?.[1] ?? "";
  return `${window.location.origin}${basePath}`;
}

function resolveUrl(slide: Slide, base: string): string {
  return resolvePublicMediaUrl(publicMomentContentUrl(slide), base);
}

function resolvePreviewUrl(slide: Slide, base: string): string {
  return resolvePublicMediaUrl(publicMomentPreviewUrl(slide), base);
}

// Random Ken-Burns params: scale + translate in random directions, seeded per ID
function kenBurns(id: string) {
  // deterministic pseudo-random from id so it doesn't change on re-render
  const h = id
    .split("")
    .reduce((a, c) => (a * 31 + c.charCodeAt(0)) & 0xffffffff, 0);
  const dx = ((h & 0xff) / 255 - 0.5) * 5;
  const dy = (((h >> 8) & 0xff) / 255 - 0.5) * 5;
  const scaleEnd = 1.06 + (((h >> 16) & 0xff) / 255) * 0.06;
  return { dx, dy, scaleEnd };
}

const PHOTO_DURATION = 6000; // ms per photo slide
const VIDEO_MAX_MS = 30000; // cap for very long videos
const POLL_INTERVAL = 30000; // re-fetch for new moments

// ── Component ────────────────────────────────────────────────────────────────

export default function TvSlideshow({
  EVENTS_URL: rawEventsUrl,
  previewToken = "",
  publicAccess,
}: Props) {
  const EVENTS_URL = normalizeEventsUrl(rawEventsUrl);
  const accessParams =
    typeof window === "undefined"
      ? {
          isPreview: false,
          previewToken: "",
          cacheKey: "",
          sendCacheKey: false,
          invitationToken: "",
          accessToken: "",
        }
      : resolvePublicAccessParams(
          {
            ...publicAccess,
            previewToken: previewToken || publicAccess?.previewToken,
          },
          window.location.search,
        );
  const effectivePreviewToken = accessParams.previewToken;
  const isAdminPreview = effectivePreviewToken.length > 0;
  const previewCacheKey = accessParams.cacheKey;
  const sendCacheKey = Boolean(accessParams.sendCacheKey);
  const invitationToken = accessParams.invitationToken;
  const [identifier, setIdentifier] = useState("");
  const eventAccess = usePublicEventAccess({
    eventsUrl: EVENTS_URL,
    identifier,
    previewToken: effectivePreviewToken,
    previewCacheKey,
    sendCacheKey,
    invitationToken,
    accessToken: accessParams.accessToken,
    enabled: Boolean(identifier),
  });
  const accessToken = eventAccess.accessToken;
  const requestAccess = useMemo(
    () => ({
      previewToken: effectivePreviewToken,
      cacheKey: previewCacheKey,
      sendCacheKey,
      invitationToken,
      accessToken,
    }),
    [
      accessToken,
      effectivePreviewToken,
      invitationToken,
      previewCacheKey,
      sendCacheKey,
    ],
  );
  const [slides, setSlides] = useState<Slide[]>([]);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [showQR, setShowQR] = useState(true);
  const [newCount, setNewCount] = useState(0);
  const [newMomentNotif, setNewMomentNotif] = useState<Slide | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showFullscreenPrompt, setShowFullscreenPrompt] = useState(true);
  const [networkError, setNetworkError] = useState(false);
  const [eventName, setEventName] = useState("");
  const [clock, setClock] = useState("");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const videoCapRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const qrHideRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notifTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollFailuresRef = useRef(0);
  const slidesRef = useRef<Slide[]>([]);
  const activeVideoRef = useRef<HTMLVideoElement | null>(null);
  const lastMediaRefreshKeyRef = useRef<string | null>(null);
  const touchStartXRef = useRef<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const mediaRefreshDelay = useMemo(
    () => getPublicMomentsRefreshDelay(slides),
    [slides],
  );
  const mediaRefreshKey = useMemo(
    () => publicMomentsMediaRefreshKey(slides),
    [slides],
  );

  // ── Init ──
  useEffect(() => {
    setIdentifier(getIdentifier());
  }, []);

  // ── Live clock ──
  useEffect(() => {
    const tick = () =>
      setClock(
        new Date().toLocaleTimeString("es-MX", {
          hour: "2-digit",
          minute: "2-digit",
        }),
      );
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, []);

  // ── New moment notification auto-dismiss ──
  useEffect(() => {
    if (!newMomentNotif) return;
    if (notifTimerRef.current) clearTimeout(notifTimerRef.current);
    notifTimerRef.current = setTimeout(() => setNewMomentNotif(null), 4500);
    return () => {
      if (notifTimerRef.current) clearTimeout(notifTimerRef.current);
    };
  }, [newMomentNotif]);

  // ── Fullscreen prompt — auto-dismiss after 5s ──
  useEffect(() => {
    if (!showFullscreenPrompt) return;
    const t = setTimeout(() => setShowFullscreenPrompt(false), 5000);
    return () => clearTimeout(t);
  }, [showFullscreenPrompt]);

  // ── Fetch ──
  const fetchSlides = useCallback(
    async (id: string, isInitial: boolean) => {
      try {
        const data = normalizePublicMomentsPage(
          await fetchApiData<unknown>(
            buildEventMomentsUrl(EVENTS_URL, id, {
              page: 1,
              limit: 500,
              ...publicAccessQueryParams(requestAccess),
            }),
            publicAccessFetchInit(requestAccess),
            "No se pudieron cargar los momentos",
          ),
        );
        const items: Slide[] = data.items ?? [];
        if (data.event_name && isInitial) setEventName(data.event_name);
        // Clear network error on success
        if (pollFailuresRef.current > 0) {
          pollFailuresRef.current = 0;
          setNetworkError(false);
        }

        const previousSlides = slidesRef.current;
        const newIds = new Set(items.map((slide) => slide.id));
        const incomingById = new Map(items.map((slide) => [slide.id, slide]));
        const previousIds = new Set(previousSlides.map((slide) => slide.id));
        const newItems = isInitial
          ? []
          : items.filter((slide) => !previousIds.has(slide.id));
        const nextSlides = isInitial
          ? items
          : [
              ...previousSlides
                .filter((slide) => newIds.has(slide.id))
                .map((slide) => incomingById.get(slide.id) ?? slide),
              ...newItems,
            ];

        slidesRef.current = nextSlides;
        setSlides(nextSlides);
        setIndex((currentIndex) =>
          nextSlides.length > 0
            ? Math.min(currentIndex, nextSlides.length - 1)
            : 0,
        );

        if (newItems.length > 0) {
          setNewCount((count) => count + newItems.length);
          setNewMomentNotif(newItems[0]);
        }
      } catch {
        pollFailuresRef.current += 1;
        if (pollFailuresRef.current >= 3) setNetworkError(true);
      }
    },
    [
      EVENTS_URL,
      accessToken,
      effectivePreviewToken,
      invitationToken,
      isAdminPreview,
      previewCacheKey,
      requestAccess,
    ],
  );

  useEffect(() => {
    if (!identifier) return;
    if (!eventAccess.ready || eventAccess.passwordRequired) return;
    fetchSlides(identifier, true);
    const poll = setInterval(
      () => fetchSlides(identifier, false),
      POLL_INTERVAL,
    );
    return () => clearInterval(poll);
  }, [
    identifier,
    eventAccess.ready,
    eventAccess.passwordRequired,
    fetchSlides,
  ]);

  useEffect(() => {
    if (!identifier || mediaRefreshDelay === null || !mediaRefreshKey) return;

    const refreshMedia = () => {
      lastMediaRefreshKeyRef.current = mediaRefreshKey;
      void fetchSlides(identifier, false);
    };

    if (mediaRefreshDelay <= 0) {
      if (lastMediaRefreshKeyRef.current === mediaRefreshKey) return;
      refreshMedia();
      return;
    }

    const timer = window.setTimeout(refreshMedia, mediaRefreshDelay);
    return () => window.clearTimeout(timer);
  }, [identifier, mediaRefreshDelay, mediaRefreshKey, fetchSlides]);

  // ── Navigation ──
  const advance = useCallback(() => {
    setIndex((i) => (slides.length > 0 ? (i + 1) % slides.length : 0));
    setNewCount(0);
  }, [slides.length]);

  const goBack = useCallback(() => {
    setIndex((i) =>
      slides.length > 0 ? (i - 1 + slides.length) % slides.length : 0,
    );
  }, [slides.length]);

  // ── Auto-advance timer (photos only) ──
  const currentSlide = slides[index];
  const currentUrl = currentSlide ? resolveUrl(currentSlide, EVENTS_URL) : "";
  const currentIsVideo =
    !!currentUrl && isVideoMedia(currentUrl, currentSlide?.content_type);

  useEffect(() => {
    if (paused || currentIsVideo || slides.length === 0) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(advance, PHOTO_DURATION);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [index, paused, currentIsVideo, slides.length, advance]);

  useEffect(() => {
    const video = activeVideoRef.current;
    if (!currentIsVideo || !video) {
      if (videoCapRef.current) clearTimeout(videoCapRef.current);
      return;
    }

    const clearVideoCap = () => {
      if (videoCapRef.current) {
        clearTimeout(videoCapRef.current);
        videoCapRef.current = null;
      }
    };

    const scheduleVideoCap = () => {
      clearVideoCap();
      if (
        !Number.isFinite(video.duration) ||
        video.duration <= VIDEO_MAX_MS / 1000
      ) {
        return;
      }
      const remaining = Math.max(0, VIDEO_MAX_MS - video.currentTime * 1000);
      videoCapRef.current = setTimeout(advance, remaining);
    };

    if (paused) {
      video.pause();
      clearVideoCap();
    } else {
      void video.play().catch(() => {});
      if (video.readyState >= HTMLMediaElement.HAVE_METADATA) {
        scheduleVideoCap();
      } else {
        video.addEventListener("loadedmetadata", scheduleVideoCap, {
          once: true,
        });
      }
    }

    return () => {
      video.removeEventListener("loadedmetadata", scheduleVideoCap);
      clearVideoCap();
    };
  }, [advance, currentIsVideo, currentUrl, paused]);

  // ── Preload next image ──
  useEffect(() => {
    if (slides.length < 2) return;
    const next = slides[(index + 1) % slides.length];
    const nextUrl = next ? resolveUrl(next, EVENTS_URL) : "";
    if (!nextUrl || isVideoMedia(nextUrl, next?.content_type)) return;
    const img = new Image();
    img.src = nextUrl;
  }, [index, slides, EVENTS_URL]);

  // ── Touch swipe (left = advance, right = back) ──
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartXRef.current = e.touches[0].clientX;
  }, []);

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (touchStartXRef.current === null) return;
      const delta = e.changedTouches[0].clientX - touchStartXRef.current;
      touchStartXRef.current = null;
      if (Math.abs(delta) < 50) return;
      if (delta < 0) advance();
      else goBack();
    },
    [advance, goBack],
  );

  // ── Fullscreen ──
  const toggleFullscreen = useCallback(async () => {
    if (!document.fullscreenElement) {
      await containerRef.current?.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
      setShowFullscreenPrompt(false);
    } else {
      await document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  // ── Pause toggle ──
  const togglePause = useCallback(() => setPaused((p) => !p), []);

  // ── Keyboard ──
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target;
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          target.closest("button, a, input, textarea, select, [role='button']"))
      ) {
        return;
      }

      if (e.key === " ") {
        e.preventDefault();
        togglePause();
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        advance();
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        goBack();
      }
      if (e.key === "f" || e.key === "F") toggleFullscreen();
      if (e.key === "Escape") setPaused(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [advance, goBack, toggleFullscreen, togglePause]);

  // ── QR auto-hide after 10s idle ──
  const resetQrTimer = useCallback(() => {
    setShowQR(true);
    if (qrHideRef.current) clearTimeout(qrHideRef.current);
    qrHideRef.current = setTimeout(() => setShowQR(false), 10000);
  }, []);

  useEffect(() => {
    resetQrTimer();
    window.addEventListener("mousemove", resetQrTimer);
    window.addEventListener("touchstart", resetQrTimer);
    return () => {
      window.removeEventListener("mousemove", resetQrTimer);
      window.removeEventListener("touchstart", resetQrTimer);
    };
  }, [resetQrTimer]);

  // ── Click zones (left half = back, right half = next) ──
  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      const x = e.clientX / window.innerWidth;
      if (x < 0.5) goBack();
      else advance();
    },
    [advance, goBack],
  );

  // ── Upload URL ──
  const uploadUrl = useMemo(() => {
    if (typeof window === "undefined" || !identifier) return "";
    return buildSharedUploadPageUrl(getPublicAppBaseUrl(), identifier, {
      previewToken: effectivePreviewToken,
      cacheKey: previewCacheKey,
      invitationToken,
      accessToken: accessToken || requestAccess.accessToken,
    });
  }, [
    accessToken,
    effectivePreviewToken,
    identifier,
    invitationToken,
    previewCacheKey,
    requestAccess.accessToken,
  ]);

  // ── Ken-Burns params for current slide (stable per slide id) ──
  const kb = useMemo(
    () => (currentSlide ? kenBurns(currentSlide.id) : null),
    [currentSlide?.id],
  );

  // ── Empty state ──
  if (eventAccess.passwordRequired && identifier) {
    return (
      <PublicEventPasswordGate
        title="Modo TV privado"
        description="Ingresa la contrasena del evento para abrir el slideshow."
        className="min-h-screen bg-black"
        onVerify={eventAccess.verifyPassword}
      />
    );
  }

  if (slides.length === 0) {
    return (
      <div className="fixed inset-0 bg-black flex flex-col items-center justify-center gap-8">
        <p className="text-white/40 text-lg tracking-wide animate-pulse">
          Esperando momentos…
        </p>
        {uploadUrl && (
          <div className="flex flex-col items-center gap-3">
            <div className="bg-white p-3 rounded-xl">
              <QRCodeSVG value={uploadUrl} size={160} />
            </div>
            <p className="text-white/50 text-sm">
              Escanea para compartir momentos
            </p>
          </div>
        )}
      </div>
    );
  }

  return (
    <MotionConfig reducedMotion="user">
      <div
        ref={containerRef}
        className="fixed inset-0 bg-black overflow-hidden select-none"
        onClick={handleClick}
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {/* ── Slides ── */}
        <AnimatePresence mode="sync">
          <motion.div
            key={currentSlide?.id}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.8, ease: "easeInOut" }}
            className="absolute inset-0"
          >
            {/* ── Ambient blur fill (Apple TV effect) — photos only ── */}
            {!currentIsVideo && currentUrl && (
              <img
                src={currentUrl}
                aria-hidden
                draggable={false}
                className="absolute inset-0 w-full h-full object-cover scale-110 blur-3xl opacity-25 pointer-events-none"
              />
            )}

            {currentIsVideo ? (
              <video
                key={currentUrl}
                src={currentUrl}
                autoPlay
                playsInline
                className="absolute inset-0 w-full h-full object-contain"
                onEnded={advance}
                onError={advance}
                ref={activeVideoRef}
              />
            ) : (
              kb && (
                <motion.img
                  key={currentUrl}
                  src={currentUrl}
                  alt={currentSlide?.description ?? ""}
                  className="absolute inset-0 w-full h-full object-contain"
                  initial={{ scale: 1, x: "0%", y: "0%" }}
                  animate={{
                    scale: kb.scaleEnd,
                    x: `${kb.dx}%`,
                    y: `${kb.dy}%`,
                  }}
                  transition={{
                    duration: PHOTO_DURATION / 1000,
                    ease: "linear",
                  }}
                  draggable={false}
                  onError={advance}
                />
              )
            )}

            {/* Dark gradient for captions */}
            {currentSlide?.description && (
              <div className="absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-black/80 to-transparent pointer-events-none" />
            )}
          </motion.div>
        </AnimatePresence>

        {/* ── Vignette (permanent dark edges) ── */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,0.55) 100%)",
          }}
        />

        {/* ── Caption ── */}
        <AnimatePresence>
          {currentSlide?.description && (
            <motion.div
              key={`caption-${currentSlide.id}`}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={{ delay: 0.5, duration: 0.5 }}
              className="absolute bottom-10 inset-x-0 flex justify-center px-8 pointer-events-none"
            >
              <p className="text-white text-lg sm:text-xl font-medium text-center max-w-2xl leading-relaxed drop-shadow-2xl">
                &ldquo;{currentSlide.description}&rdquo;
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Progress bar ── */}
        {!currentIsVideo && (
          <div className="absolute bottom-0 inset-x-0 h-0.5 bg-white/10 pointer-events-none">
            <motion.div
              key={`${currentSlide?.id}-${paused}`}
              className="h-full bg-white/60 origin-left"
              initial={{ scaleX: 0 }}
              animate={{ scaleX: paused ? undefined : 1 }}
              transition={{ duration: PHOTO_DURATION / 1000, ease: "linear" }}
            />
          </div>
        )}

        {/* ── Top bar (event name + controls) ── */}
        <div className="absolute top-0 inset-x-0 flex items-start justify-between p-5 pointer-events-none">
          <div className="flex flex-col gap-1">
            {eventName && (
              <p className="text-white/50 text-sm font-medium tracking-wide drop-shadow">
                {eventName}
              </p>
            )}
            <div className="flex items-center gap-2">
              {clock && (
                <span className="text-white/30 text-xs font-mono tabular-nums">
                  {clock}
                </span>
              )}
              {paused && (
                <span className="text-white/40 text-xs tracking-widest uppercase">
                  · Pausado
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3 pointer-events-auto">
            {networkError && (
              <div
                title="Sin conexión — los momentos nuevos no se están cargando"
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-orange-500/20 border border-orange-500/30 text-orange-400 text-xs"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse" />
                Sin red
              </div>
            )}
            {newCount > 0 && (
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 backdrop-blur-sm border border-white/20 text-white text-xs font-medium"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                {newCount} nuevo{newCount !== 1 ? "s" : ""}
              </motion.div>
            )}
            {/* Play / Pause toggle */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                togglePause();
              }}
              className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white/60 hover:text-white transition-colors backdrop-blur-sm border border-white/10"
              title={paused ? "Reanudar (Space)" : "Pausar (Space)"}
              aria-label={paused ? "Reanudar" : "Pausar"}
            >
              {paused ? (
                /* Play icon */
                <svg className="size-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5.14v14l11-7-11-7z" />
                </svg>
              ) : (
                /* Pause icon */
                <svg className="size-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
                </svg>
              )}
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                toggleFullscreen();
              }}
              className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white/60 hover:text-white transition-colors backdrop-blur-sm border border-white/10"
              title={
                isFullscreen
                  ? "Salir de pantalla completa (F)"
                  : "Pantalla completa (F)"
              }
              aria-label={
                isFullscreen
                  ? "Salir de pantalla completa"
                  : "Ver en pantalla completa"
              }
            >
              {isFullscreen ? (
                <svg
                  className="size-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M9 9V4.5M9 9H4.5M15 9h4.5M15 9V4.5M9 15H4.5M9 15v4.5M15 15v4.5M15 15h4.5"
                  />
                </svg>
              ) : (
                <svg
                  className="size-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15"
                  />
                </svg>
              )}
            </button>
          </div>
        </div>

        {/* ── Slide counter (bottom-right) ── */}
        <div className="absolute bottom-4 right-5 text-white/30 text-xs tabular-nums font-mono pointer-events-none">
          {index + 1} / {slides.length}
        </div>

        {/* ── Fullscreen prompt (first load, auto-dismiss 5s) ── */}
        <AnimatePresence>
          {showFullscreenPrompt && !isFullscreen && (
            <motion.button
              type="button"
              aria-label="Abrir presentación en pantalla completa"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.35 }}
              className="group absolute inset-0 z-50 flex items-center justify-center pointer-events-auto focus-visible:outline-none"
              onClick={(e) => {
                e.stopPropagation();
                toggleFullscreen();
              }}
            >
              <span className="flex flex-col items-center gap-3 rounded-2xl border border-white/15 bg-black/70 px-10 py-7 shadow-2xl backdrop-blur-xl transition-shadow group-focus-visible:ring-2 group-focus-visible:ring-white group-focus-visible:ring-offset-4 group-focus-visible:ring-offset-black">
                <svg
                  className="size-9 text-white/50"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15"
                  />
                </svg>
                <span className="text-base font-semibold text-white">
                  Abrir en pantalla completa
                </span>
                <span className="text-sm text-white/40">
                  Toca aquí · tecla F
                </span>
              </span>
            </motion.button>
          )}
        </AnimatePresence>

        {/* ── New moment live notification (bottom-right) ── */}
        <AnimatePresence>
          {newMomentNotif && (
            <motion.div
              key={newMomentNotif.id}
              initial={{ opacity: 0, x: 32, scale: 0.9 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 32, scale: 0.9 }}
              transition={{ type: "spring", stiffness: 320, damping: 26 }}
              className="absolute bottom-12 right-5 flex items-center gap-3 bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl px-3 py-2.5 shadow-2xl pointer-events-none max-w-[220px]"
            >
              {publicMomentPreviewUrl(newMomentNotif) && (
                <img
                  src={resolvePreviewUrl(newMomentNotif, EVENTS_URL)}
                  className="w-11 h-11 rounded-xl object-cover flex-shrink-0"
                  alt=""
                />
              )}
              <div className="flex flex-col min-w-0">
                <span className="text-white text-xs font-semibold leading-snug">
                  Nuevo momento
                </span>
                <span className="text-white/50 text-xs truncate">
                  Acaba de llegar
                </span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── QR (bottom-left, auto-hides) ── */}
        <AnimatePresence>
          {showQR && uploadUrl && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={{ duration: 0.4 }}
              className="absolute bottom-5 left-5 flex items-end gap-3 pointer-events-none"
            >
              <div className="bg-white/90 backdrop-blur-sm p-2.5 rounded-xl shadow-2xl shadow-black/40">
                <QRCodeSVG value={uploadUrl} size={104} />
              </div>
              <p className="text-white/50 text-xs mb-1 leading-tight max-w-[120px]">
                Comparte tus momentos
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </MotionConfig>
  );
}
