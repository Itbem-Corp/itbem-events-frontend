"use client";

import {
  memo,
  useEffect,
  useId,
  useRef,
  useState,
  type TouchEvent,
} from "react";
import {
  ChevronLeft,
  ChevronRight,
  LoaderCircle,
  Play,
  RotateCcw,
  X,
} from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { cn } from "../../lib/utils";
import { isVideoMedia, resolvePublicMediaUrl } from "../../lib/mediaUrl";
import {
  publicMomentContentUrl,
  type PublicMoment as Moment,
} from "../../lib/publicMoments";
import type { MomentsTheme } from "./themes";

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

export interface MomentsGalleryLightboxProps {
  kind: "photo" | "video";
  moments: Moment[];
  index: number;
  eventsUrl: string;
  theme: MomentsTheme;
  origin: { x: number; y: number } | null;
  onClose: () => void;
  onNext: () => void;
  onPrev: () => void;
}

function resolveFullUrl(moment: Moment, eventsUrl: string): string {
  return resolvePublicMediaUrl(publicMomentContentUrl(moment), eventsUrl);
}

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
  ).filter(
    (element) =>
      !element.hasAttribute("hidden") &&
      element.getAttribute("aria-hidden") !== "true" &&
      element.getClientRects().length > 0,
  );
}

const LightboxVideo = memo(function LightboxVideo({
  src,
  retryToken,
  className,
  onReady,
  onError,
}: {
  src: string;
  retryToken: number;
  className: string;
  onReady: () => void;
  onError: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [needsTap, setNeedsTap] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    setNeedsTap(false);
    const playAttempt = video.play();
    playAttempt?.catch(() => setNeedsTap(true));

    return () => video.pause();
  }, [retryToken, src]);

  return (
    <div className="relative">
      <video
        ref={videoRef}
        src={src}
        controls
        playsInline
        controlsList="nodownload"
        disablePictureInPicture
        onCanPlay={onReady}
        onError={onError}
        onContextMenu={(event) => event.preventDefault()}
        className={className}
      />
      {needsTap && (
        <button
          type="button"
          onClick={() => {
            void videoRef.current?.play();
            setNeedsTap(false);
          }}
          className="absolute inset-0 flex items-center justify-center rounded-2xl bg-black/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-inset"
          aria-label="Reproducir video"
        >
          <span className="flex size-16 items-center justify-center rounded-full border border-white/30 bg-white/20 backdrop-blur-sm">
            <Play className="ml-1 size-7 text-white" fill="currentColor" aria-hidden="true" />
          </span>
        </button>
      )}
    </div>
  );
});

export function MomentsGalleryLightbox({
  kind,
  moments,
  index,
  eventsUrl,
  theme,
  origin,
  onClose,
  onNext,
  onPrev,
}: MomentsGalleryLightboxProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const actionsRef = useRef({ onClose, onNext, onPrev, canNext: false, canPrev: false });
  const prefersReducedMotion = useReducedMotion();
  const titleId = useId();
  const instructionsId = useId();
  const descriptionId = useId();
  const [retryToken, setRetryToken] = useState(0);
  const [loadedMediaKey, setLoadedMediaKey] = useState<string | null>(null);
  const [failedMediaKey, setFailedMediaKey] = useState<string | null>(null);

  const safeIndex = moments.length
    ? Math.min(Math.max(index, 0), moments.length - 1)
    : 0;
  const moment = moments[safeIndex];
  const canPrev = safeIndex > 0;
  const canNext = safeIndex < moments.length - 1;
  const mediaUrl = moment ? resolveFullUrl(moment, eventsUrl) : "";
  const isVideo =
    kind === "video" ||
    Boolean(moment && isVideoMedia(mediaUrl, moment.content_type));
  const mediaKey = `${moment?.id ?? "missing"}:${retryToken}`;
  const mediaLoaded = loadedMediaKey === mediaKey;
  const mediaFailed = failedMediaKey === mediaKey;

  useEffect(() => {
    actionsRef.current = { onClose, onNext, onPrev, canNext, canPrev };
  }, [canNext, canPrev, onClose, onNext, onPrev]);

  useEffect(() => {
    const dialog = dialogRef.current;
    const focusFrame = window.requestAnimationFrame(() => {
      closeButtonRef.current?.focus({ preventScroll: true });
    });

    const handleKeyDown = (event: KeyboardEvent) => {
      const actions = actionsRef.current;

      if (event.key === "Escape") {
        event.preventDefault();
        actions.onClose();
        return;
      }
      if (event.key === "ArrowRight" && actions.canNext) {
        event.preventDefault();
        actions.onNext();
        return;
      }
      if (event.key === "ArrowLeft" && actions.canPrev) {
        event.preventDefault();
        actions.onPrev();
        return;
      }
      if (event.key !== "Tab" || !dialog) return;

      const focusable = getFocusableElements(dialog);
      if (focusable.length === 0) {
        event.preventDefault();
        dialog.focus({ preventScroll: true });
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !dialog.contains(active))) {
        event.preventDefault();
        last.focus({ preventScroll: true });
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus({ preventScroll: true });
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  useEffect(() => {
    if (!moment) return;

    const preload = (candidate: Moment | undefined) => {
      if (!candidate) return;
      const url = resolveFullUrl(candidate, eventsUrl);
      if (!url || isVideoMedia(url, candidate.content_type)) return;
      const image = new Image();
      image.src = url;
    };

    preload(moments[safeIndex - 1]);
    preload(moments[safeIndex + 1]);
  }, [eventsUrl, moment, moments, safeIndex]);

  if (!moment) return null;

  const handleTouchStart = (event: TouchEvent<HTMLDivElement>) => {
    const touch = event.touches[0];
    if (!touch) return;
    touchStartRef.current = { x: touch.clientX, y: touch.clientY };
  };

  const handleTouchEnd = (event: TouchEvent<HTMLDivElement>) => {
    const start = touchStartRef.current;
    const touch = event.changedTouches[0];
    touchStartRef.current = null;
    if (!start || !touch) return;

    const deltaX = touch.clientX - start.x;
    const deltaY = touch.clientY - start.y;
    if (Math.abs(deltaX) < 50 || Math.abs(deltaY) > Math.abs(deltaX)) return;
    if (deltaX < 0 && canNext) onNext();
    if (deltaX > 0 && canPrev) onPrev();
  };

  const markReady = () => {
    setFailedMediaKey((current) => (current === mediaKey ? null : current));
    setLoadedMediaKey(mediaKey);
  };
  const markFailed = () => setFailedMediaKey(mediaKey);
  const retry = () => {
    setRetryToken((current) => current + 1);
  };

  const kindLabel = isVideo ? "video" : "foto";
  const describedBy = moment.description
    ? `${instructionsId} ${descriptionId}`
    : instructionsId;

  return (
    <motion.div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={describedBy}
      tabIndex={-1}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: prefersReducedMotion ? 0 : 0.2 }}
      className={cn(
        "fixed inset-0 z-[60] flex flex-col items-center justify-center overscroll-contain backdrop-blur-sm",
        isVideo ? "bg-black/95" : theme.lightboxBg,
      )}
      style={{ touchAction: "none" }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <h2 id={titleId} className="sr-only">
        Visor de {kindLabel}
      </h2>
      <p id={instructionsId} className="sr-only">
        Usa las flechas izquierda y derecha para navegar. Presiona Escape para cerrar.
      </p>

      <button
        ref={closeButtonRef}
        type="button"
        onClick={onClose}
        className="absolute right-4 top-4 z-20 flex size-11 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
        aria-label={`Cerrar visor de ${kindLabel}`}
      >
        <X className="size-6" strokeWidth={2.4} aria-hidden="true" />
      </button>

      {canPrev && (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onPrev();
          }}
          className="absolute left-2 top-1/2 z-20 flex size-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/35 text-white backdrop-blur-sm transition-colors hover:bg-black/55 focus:outline-none focus-visible:ring-2 focus-visible:ring-white sm:left-4"
          aria-label={`Momento anterior, ${safeIndex} de ${moments.length}`}
        >
          <ChevronLeft className="size-6" aria-hidden="true" />
        </button>
      )}

      {canNext && (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onNext();
          }}
          className="absolute right-2 top-1/2 z-20 flex size-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/35 text-white backdrop-blur-sm transition-colors hover:bg-black/55 focus:outline-none focus-visible:ring-2 focus-visible:ring-white sm:right-4"
          aria-label={`Momento siguiente, ${safeIndex + 2} de ${moments.length}`}
        >
          <ChevronRight className="size-6" aria-hidden="true" />
        </button>
      )}

      <div
        className="pointer-events-none absolute left-1/2 top-5 z-10 -translate-x-1/2 text-xs font-medium text-white/70"
        aria-live="polite"
        aria-atomic="true"
      >
        {safeIndex + 1} / {moments.length}
      </div>

      <motion.div
        key={moment.id}
        initial={
          prefersReducedMotion ? { opacity: 0 } : { scale: 0.92, opacity: 0 }
        }
        animate={{ scale: 1, opacity: 1 }}
        exit={
          prefersReducedMotion ? { opacity: 0 } : { scale: 0.92, opacity: 0 }
        }
        transition={
          prefersReducedMotion
            ? { duration: 0 }
            : { type: "spring", damping: 28, stiffness: 350 }
        }
        style={{ transformOrigin: `${origin?.x ?? 50}% ${origin?.y ?? 50}%` }}
        className={cn(
          "relative z-10 px-14 sm:px-16",
          isVideo ? "w-full max-w-2xl" : "max-h-[80vh] max-w-full",
        )}
        onClick={(event) => event.stopPropagation()}
      >
        {!mediaLoaded && !mediaFailed && (
          <div
            role="status"
            aria-live="polite"
            className="absolute inset-0 flex min-h-44 items-center justify-center"
          >
            <span className="flex items-center gap-2 rounded-full bg-black/45 px-4 py-2 text-sm text-white backdrop-blur-sm">
              <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
              Cargando momento…
            </span>
          </div>
        )}

        {mediaFailed && (
          <div
            role="alert"
            className="flex min-h-56 w-full min-w-56 flex-col items-center justify-center gap-4 rounded-2xl bg-black/55 px-6 text-center text-white backdrop-blur-sm"
          >
            <p className="text-sm">No pudimos cargar este momento.</p>
            <button
              type="button"
              onClick={retry}
              className="inline-flex min-h-11 items-center gap-2 rounded-full bg-white/15 px-4 py-2 text-sm font-semibold transition-colors hover:bg-white/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              <RotateCcw className="size-4" aria-hidden="true" />
              Reintentar
            </button>
          </div>
        )}

        {!mediaFailed &&
          (isVideo ? (
            <LightboxVideo
              key={mediaKey}
              src={mediaUrl}
              retryToken={retryToken}
              className={cn(
                "max-h-[78vh] w-full rounded-2xl",
                mediaLoaded ? "opacity-100" : "opacity-0",
              )}
              onReady={markReady}
              onError={markFailed}
            />
          ) : (
            <img
              key={mediaKey}
              src={mediaUrl}
              alt={moment.description || `Momento ${safeIndex + 1} del evento`}
              draggable={false}
              decoding="async"
              onLoad={markReady}
              onError={markFailed}
              className={cn(
                "max-h-[78vh] max-w-full rounded-2xl object-contain transition-opacity duration-200 motion-reduce:transition-none",
                mediaLoaded ? "opacity-100" : "opacity-0",
              )}
            />
          ))}
      </motion.div>

      {moment.description && (
        <div className="pointer-events-none absolute bottom-6 left-1/2 z-20 w-full max-w-md -translate-x-1/2 px-6">
          <motion.p
            id={descriptionId}
            initial={{ opacity: 0, y: prefersReducedMotion ? 0 : 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: prefersReducedMotion ? 0 : 0.15 }}
            className="rounded-2xl bg-black/40 px-5 py-3 text-center text-sm leading-relaxed text-white/90 backdrop-blur-md"
          >
            “{moment.description}”
          </motion.p>
        </div>
      )}
    </motion.div>
  );
}
