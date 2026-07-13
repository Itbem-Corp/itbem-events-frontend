"use client";

import { X } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";

interface InvalidUploadLinkStateProps {
  theme: "dark" | "light";
}

export function InvalidUploadLinkState({
  theme,
}: InvalidUploadLinkStateProps) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.section
      initial={reduceMotion ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={
        reduceMotion ? { duration: 0 } : { duration: 0.35, ease: "easeOut" }
      }
      aria-labelledby="invalid-upload-link-title"
      aria-describedby="invalid-upload-link-description"
      role="status"
      aria-live="polite"
      aria-atomic="true"
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
          theme === "dark"
            ? "mb-7 flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-indigo-500 text-white shadow-[0_0_42px_rgba(139,92,246,0.34)]"
            : "mb-7 flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-violet-400 to-indigo-500 text-white shadow-lg shadow-indigo-500/25"
        }
      >
        <X className="h-9 w-9" strokeWidth={2.2} />
      </motion.div>

      <span
        className={
          theme === "dark"
            ? "mb-4 rounded-full border border-violet-400/20 bg-violet-400/10 px-3 py-1 text-xs font-semibold tracking-wide text-violet-200"
            : "mb-4 rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-xs font-semibold tracking-wide text-violet-700"
        }
      >
        Enlace incompleto
      </span>

      <h1
        id="invalid-upload-link-title"
        className={
          theme === "dark"
            ? "text-2xl font-bold tracking-tight text-white"
            : "text-2xl font-bold tracking-tight text-gray-950"
        }
      >
        Necesitamos el enlace completo
      </h1>
      <p
        id="invalid-upload-link-description"
        className={
          theme === "dark"
            ? "mt-3 text-sm leading-6 text-gray-300"
            : "mt-3 text-sm leading-6 text-gray-600"
        }
      >
        Vuelve a tu invitación y escanea de nuevo el código QR para compartir
        tus fotos y videos.
      </p>
      <p
        className={
          theme === "dark"
            ? "mt-5 text-xs leading-5 text-gray-400"
            : "mt-5 text-xs leading-5 text-gray-500"
        }
      >
        Si el problema continúa, pide al organizador un enlace nuevo.
      </p>
    </motion.section>
  );
}
