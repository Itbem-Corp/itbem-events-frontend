"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { CircleCheck, CircleX, Info, X, type LucideIcon } from "lucide-react";
import type { ToastItem } from "../../hooks/useToast";

interface ToastListProps {
  toasts: ToastItem[];
  onRemove: (id: string) => void;
}

const colorMap: Record<ToastItem["type"], string> = {
  success: "border-emerald-200 text-emerald-900",
  error: "border-rose-200 text-rose-900",
  info: "border-amber-200 text-zinc-900",
};

const iconMap: Record<ToastItem["type"], LucideIcon> = {
  success: CircleCheck,
  error: CircleX,
  info: Info,
};

const iconColorMap: Record<ToastItem["type"], string> = {
  success: "text-emerald-600",
  error: "text-rose-600",
  info: "text-amber-600",
};

export default function ToastList({ toasts, onRemove }: ToastListProps) {
  const reduceMotion = useReducedMotion();

  return (
    <div
      className="pointer-events-none fixed inset-x-4 top-4 z-[70] flex flex-col items-end gap-2 sm:left-auto sm:w-full sm:max-w-sm"
      aria-label="Notificaciones"
    >
      <AnimatePresence initial={false}>
        {toasts.map((toast) => {
          const Icon = iconMap[toast.type];

          return (
            <motion.div
              key={toast.id}
              initial={
                reduceMotion ? false : { opacity: 0, y: -12, scale: 0.98 }
              }
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={
                reduceMotion
                  ? { opacity: 0 }
                  : { opacity: 0, y: -8, scale: 0.98 }
              }
              transition={{ duration: reduceMotion ? 0 : 0.2, ease: "easeOut" }}
              className={`pointer-events-auto flex w-full items-center gap-3 rounded-2xl border bg-white/95 px-3 py-2.5 shadow-[0_18px_48px_rgba(7,41,58,0.18)] backdrop-blur-xl ${colorMap[toast.type]}`}
              role={toast.type === "error" ? "alert" : "status"}
              aria-live={toast.type === "error" ? "assertive" : "polite"}
            >
              <Icon
                className={`size-5 shrink-0 ${iconColorMap[toast.type]}`}
                aria-hidden="true"
              />
              <span className="min-w-0 flex-1 font-aloevera text-sm leading-5">
                {toast.message}
              </span>
              <button
                type="button"
                onClick={() => onRemove(toast.id)}
                className="flex size-11 shrink-0 items-center justify-center rounded-xl text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-700"
                aria-label="Cerrar notificación"
              >
                <X className="size-4" aria-hidden="true" />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
