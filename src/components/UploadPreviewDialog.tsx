"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { createPortal } from "react-dom";
import { motion, useReducedMotion } from "framer-motion";
import { Image as ImageIcon, ImageOff, LoaderCircle, X } from "lucide-react";

export type UploadPreviewKind = "image" | "video" | "heic";

export interface UploadPreviewItem {
  kind: UploadPreviewKind;
  name: string;
  sizeLabel: string;
  src: string | null;
}

interface UploadPreviewDialogProps {
  item: UploadPreviewItem;
  onClose: () => void;
}

type MediaLoadState = "loading" | "ready" | "error";

const FOCUSABLE_SELECTOR = [
  "button:not([disabled])",
  "a[href]",
  "video[controls]",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

function previewInitialState(kind: UploadPreviewKind): MediaLoadState {
  return kind === "heic" ? "ready" : "loading";
}

export function UploadPreviewDialog({
  item,
  onClose,
}: UploadPreviewDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const onCloseRef = useRef(onClose);
  const titleId = useId();
  const detailId = useId();
  const shouldReduceMotion = Boolean(useReducedMotion());
  const [loadState, setLoadState] = useState<MediaLoadState>(() =>
    previewInitialState(item.kind),
  );

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    setLoadState(previewInitialState(item.kind));
  }, [item.kind, item.src]);

  useEffect(() => {
    const dialog = dialogRef.current;
    const previouslyFocused =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const previousOverflow = document.body.style.overflow;
    const previousPaddingRight = document.body.style.paddingRight;
    const scrollbarWidth =
      window.innerWidth - document.documentElement.clientWidth;

    document.body.style.overflow = "hidden";
    if (scrollbarWidth > 0) {
      const currentPadding = Number.parseFloat(
        window.getComputedStyle(document.body).paddingRight,
      );
      document.body.style.paddingRight = `${currentPadding + scrollbarWidth}px`;
    }

    const focusFrame = window.requestAnimationFrame(() => {
      closeButtonRef.current?.focus({ preventScroll: true });
    });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }

      if (event.key !== "Tab" || !dialog) return;

      const focusable = Array.from(
        dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      ).filter((element) => element.offsetParent !== null);
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) {
        event.preventDefault();
        return;
      }

      const activeElement = document.activeElement;
      if (
        event.shiftKey &&
        (activeElement === first || !dialog.contains(activeElement))
      ) {
        event.preventDefault();
        last.focus();
      } else if (
        !event.shiftKey &&
        (activeElement === last || !dialog.contains(activeElement))
      ) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown, true);

    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener("keydown", handleKeyDown, true);
      videoRef.current?.pause();
      document.body.style.overflow = previousOverflow;
      document.body.style.paddingRight = previousPaddingRight;
      if (previouslyFocused?.isConnected) {
        previouslyFocused.focus({ preventScroll: true });
      }
    };
  }, []);

  const handleBackdropClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) onCloseRef.current();
  };

  const mediaClassName = `max-h-[78dvh] max-w-full rounded-2xl object-contain transition-opacity duration-200 motion-reduce:transition-none ${
    loadState === "ready" ? "opacity-100" : "opacity-0"
  }`;

  return createPortal(
    <motion.div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={detailId}
      aria-busy={loadState === "loading"}
      initial={shouldReduceMotion ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: shouldReduceMotion ? 0 : 0.16 }}
      className="fixed inset-0 z-50 flex overscroll-contain items-center justify-center bg-black/90 p-4 pb-20 pt-16"
      onClick={handleBackdropClick}
    >
      <button
        ref={closeButtonRef}
        type="button"
        onClick={() => onCloseRef.current()}
        className="absolute right-4 top-4 z-10 flex min-h-11 min-w-11 items-center justify-center rounded-full bg-white/10 p-2 text-white transition-colors hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white motion-reduce:transition-none"
        aria-label="Cerrar vista previa"
      >
        <X aria-hidden="true" className="h-6 w-6" />
      </button>

      <motion.div
        initial={shouldReduceMotion ? false : { scale: 0.96, opacity: 0, y: 8 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={
          shouldReduceMotion
            ? { opacity: 0 }
            : { scale: 0.98, opacity: 0, y: 4 }
        }
        transition={
          shouldReduceMotion
            ? { duration: 0 }
            : { type: "spring", damping: 28, stiffness: 320 }
        }
        className="relative flex max-h-full max-w-full items-center justify-center"
      >
        {loadState === "loading" && (
          <div
            className="absolute inset-0 flex min-h-40 min-w-40 items-center justify-center"
            role="status"
            aria-live="polite"
          >
            <span className="sr-only">Cargando {item.name}</span>
            <LoaderCircle
              aria-hidden="true"
              className="h-7 w-7 animate-spin text-white/80 motion-reduce:animate-none"
            />
          </div>
        )}

        {loadState === "error" && (
          <div
            className="flex max-w-xs flex-col items-center gap-3 text-center text-white/70"
            role="status"
          >
            <ImageOff aria-hidden="true" className="h-14 w-14" />
            <p className="text-sm font-medium">
              No pudimos cargar la vista previa
            </p>
            <p className="text-xs text-white/45">
              El archivo sigue listo para compartirse.
            </p>
          </div>
        )}

        {item.kind === "video" && item.src ? (
          <video
            ref={videoRef}
            src={item.src}
            controls
            autoPlay={!shouldReduceMotion}
            playsInline
            preload="metadata"
            aria-label={`Vista previa de ${item.name}`}
            className={mediaClassName}
            onCanPlay={() => setLoadState("ready")}
            onError={() => setLoadState("error")}
          />
        ) : item.kind === "heic" ? (
          <div className="flex flex-col items-center gap-3 text-center text-white/60">
            <ImageIcon aria-hidden="true" className="h-16 w-16" />
            <p className="text-sm font-medium">{item.name}</p>
            <p className="text-xs text-white/40">
              Vista previa no disponible para HEIC
            </p>
          </div>
        ) : item.src ? (
          <img
            src={item.src}
            alt={`Vista previa de ${item.name}`}
            className={mediaClassName}
            onLoad={() => setLoadState("ready")}
            onError={() => setLoadState("error")}
          />
        ) : null}
      </motion.div>

      <div className="absolute bottom-4 left-1/2 flex max-w-[calc(100%-2rem)] -translate-x-1/2 items-center gap-3 rounded-full bg-white/10 px-5 py-2 backdrop-blur-lg">
        <span
          id={titleId}
          className="max-w-[min(60vw,20rem)] truncate text-sm font-medium text-white/80"
        >
          {item.name}
        </span>
        <span id={detailId} className="shrink-0 text-xs text-white/40">
          {item.sizeLabel}
        </span>
      </div>
    </motion.div>,
    document.body,
  );
}
