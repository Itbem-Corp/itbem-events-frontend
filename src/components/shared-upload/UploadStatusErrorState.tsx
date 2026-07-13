"use client";

import { Link2Off, LoaderCircle, RefreshCw } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import type { UploadStatusErrorKind } from "../../lib/uploadStatusError";

interface UploadStatusErrorStateProps {
  theme: "dark" | "light";
  kind: UploadStatusErrorKind;
  retrying: boolean;
  onRetry?: () => void;
}

const ERROR_CONTENT: Record<
  UploadStatusErrorKind,
  { eyebrow: string; title: string; description: string }
> = {
  transient: {
    eyebrow: "Conexión interrumpida",
    title: "No pudimos comprobar el enlace",
    description:
      "La conexión no respondió a tiempo. Tus archivos siguen intactos y puedes volver a intentarlo.",
  },
  unauthorized: {
    eyebrow: "Acceso requerido",
    title: "Este enlace necesita verificación",
    description:
      "Vuelve a la invitación original para entrar con el acceso correcto.",
  },
  forbidden: {
    eyebrow: "Subida no disponible",
    title: "Este enlace no permite compartir archivos",
    description:
      "El organizador debe habilitar nuevamente la recepción de fotos y videos.",
  },
  invalid: {
    eyebrow: "Enlace no válido",
    title: "No pudimos validar este acceso",
    description:
      "Vuelve a la invitación original y abre de nuevo el enlace para compartir archivos.",
  },
  "not-found": {
    eyebrow: "Enlace no disponible",
    title: "No encontramos este evento",
    description:
      "Escanea otra vez el código QR o solicita al organizador un enlace actualizado.",
  },
};

export function UploadStatusErrorState({
  theme,
  kind,
  retrying,
  onRetry,
}: UploadStatusErrorStateProps) {
  const reduceMotion = useReducedMotion();
  const isDark = theme === "dark";
  const content = ERROR_CONTENT[kind];
  const canRetry = kind === "transient" && Boolean(onRetry);

  return (
    <motion.section
      initial={reduceMotion ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={
        reduceMotion ? { duration: 0 } : { duration: 0.35, ease: "easeOut" }
      }
      role="alert"
      aria-labelledby="upload-status-error-title"
      aria-describedby="upload-status-error-description"
      className="relative z-10 flex w-full max-w-sm flex-col items-center text-center"
    >
      <motion.div
        initial={reduceMotion ? false : { scale: 0.82, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={
          reduceMotion
            ? { duration: 0 }
            : { type: "spring", stiffness: 280, damping: 22 }
        }
        aria-hidden="true"
        className={
          isDark
            ? "mb-7 flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-indigo-500 text-white shadow-[0_0_42px_rgba(139,92,246,0.34)]"
            : "mb-7 flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-violet-400 to-indigo-500 text-white shadow-lg shadow-indigo-500/25"
        }
      >
        <Link2Off className="h-9 w-9" strokeWidth={1.9} />
      </motion.div>

      <span
        className={
          isDark
            ? "mb-4 rounded-full border border-violet-400/20 bg-violet-400/10 px-3 py-1 text-xs font-semibold tracking-wide text-violet-200"
            : "mb-4 rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-xs font-semibold tracking-wide text-violet-700"
        }
      >
        {content.eyebrow}
      </span>

      <h1
        id="upload-status-error-title"
        className={
          isDark
            ? "text-2xl font-bold tracking-tight text-white"
            : "text-2xl font-bold tracking-tight text-gray-950"
        }
      >
        {content.title}
      </h1>
      <p
        id="upload-status-error-description"
        className={
          isDark
            ? "mt-3 text-sm leading-6 text-gray-300"
            : "mt-3 text-sm leading-6 text-gray-600"
        }
      >
        {content.description}
      </p>

      {canRetry && (
        <button
          type="button"
          onClick={onRetry}
          disabled={retrying}
          aria-busy={retrying}
          className={
            isDark
              ? "mt-7 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-gray-950 shadow-[0_14px_34px_-18px_rgba(255,255,255,0.65)] transition hover:bg-violet-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-950 active:scale-[0.99] disabled:cursor-wait disabled:opacity-75"
              : "mt-7 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-gray-950 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-gray-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2 active:scale-[0.99] disabled:cursor-wait disabled:opacity-75"
          }
        >
          {retrying ? (
            <LoaderCircle aria-hidden="true" className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw aria-hidden="true" className="h-4 w-4" />
          )}
          {retrying ? "Reintentando…" : "Reintentar"}
        </button>
      )}

      <p
        className={
          isDark
            ? "mt-5 text-xs leading-5 text-gray-400"
            : "mt-5 text-xs leading-5 text-gray-500"
        }
      >
        {kind === "transient"
          ? "Si el problema continúa, comprueba tu red o escanea otra vez el código QR."
          : "Si necesitas ayuda, contacta al organizador del evento."}
      </p>
    </motion.section>
  );
}
