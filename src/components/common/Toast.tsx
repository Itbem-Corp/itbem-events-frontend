"use client";

import { AnimatePresence, motion } from "framer-motion";
import type { ToastItem } from "../../hooks/useToast";

interface ToastListProps {
  toasts: ToastItem[];
  onRemove: (id: string) => void;
}

const colorMap: Record<ToastItem["type"], string> = {
  success: "bg-green-50 border-green-400 text-green-800",
  error: "bg-red-50 border-red-400 text-red-800",
  info: "bg-amber-50 border-gold text-dark",
};

const iconMap: Record<ToastItem["type"], string> = {
  success: "✓",
  error: "✕",
  info: "i",
};

export default function ToastList({ toasts, onRemove }: ToastListProps) {
  return (
    <div
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-2 items-center pointer-events-none"
      aria-live="polite"
      aria-label="Notificaciones"
    >
      <AnimatePresence>
        {toasts.map((toast) => (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className={`flex items-center gap-3 px-5 py-3 rounded-2xl border-2 shadow-lg
              font-aloevera text-sm max-w-xs text-center cursor-pointer pointer-events-auto
              ${colorMap[toast.type]}`}
            onClick={() => onRemove(toast.id)}
            role="status"
          >
            <span className="font-bold text-base" aria-hidden="true">
              {iconMap[toast.type]}
            </span>
            <span>{toast.message}</span>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
