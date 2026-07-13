"use client";

import { LoaderCircle } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";

interface UploadStatusLoadingStateProps {
  theme: "dark" | "light";
}

export function UploadStatusLoadingState({
  theme,
}: UploadStatusLoadingStateProps) {
  const reduceMotion = useReducedMotion();
  const isDark = theme === "dark";

  return (
    <motion.section
      initial={reduceMotion ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={reduceMotion ? { duration: 0 } : { duration: 0.25 }}
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className="relative z-10 flex w-full max-w-sm flex-col items-center text-center"
    >
      <div
        aria-hidden="true"
        className={
          isDark
            ? "mb-7 flex h-20 w-20 items-center justify-center rounded-full border border-violet-400/25 bg-violet-400/10 text-violet-200 shadow-[0_0_42px_rgba(139,92,246,0.18)]"
            : "mb-7 flex h-20 w-20 items-center justify-center rounded-full border border-violet-200 bg-violet-50 text-violet-600 shadow-sm"
        }
      >
        <LoaderCircle
          className={reduceMotion ? "h-8 w-8" : "h-8 w-8 animate-spin"}
          strokeWidth={1.8}
        />
      </div>

      <span
        className={
          isDark
            ? "mb-4 rounded-full border border-violet-400/20 bg-violet-400/10 px-3 py-1 text-xs font-semibold tracking-wide text-violet-200"
            : "mb-4 rounded-full border border-violet-200 bg-white px-3 py-1 text-xs font-semibold tracking-wide text-violet-700"
        }
      >
        Preparando tu espacio
      </span>
      <h1
        className={
          isDark
            ? "text-2xl font-bold tracking-tight text-white"
            : "text-2xl font-bold tracking-tight text-gray-950"
        }
      >
        Comprobando el enlace
      </h1>
      <p
        className={
          isDark
            ? "mt-3 text-sm leading-6 text-gray-300"
            : "mt-3 text-sm leading-6 text-gray-600"
        }
      >
        Estamos validando el acceso y el espacio disponible antes de mostrar tus
        archivos.
      </p>
    </motion.section>
  );
}
