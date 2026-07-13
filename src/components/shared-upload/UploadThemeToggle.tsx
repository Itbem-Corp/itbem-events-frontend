"use client";

import { Moon, Sun } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";

interface UploadThemeToggleProps {
  theme: "dark" | "light";
  onToggle: () => void;
}

export function UploadThemeToggle({ theme, onToggle }: UploadThemeToggleProps) {
  const reduceMotion = useReducedMotion();
  const isDark = theme === "dark";
  const label = isDark ? "Cambiar a modo claro" : "Cambiar a modo oscuro";
  const Icon = isDark ? Sun : Moon;

  return (
    <motion.button
      type="button"
      onClick={onToggle}
      whileTap={reduceMotion ? undefined : { scale: 0.92 }}
      className={`fixed right-4 top-4 z-50 flex h-11 w-11 items-center justify-center rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 ${
        isDark
          ? "border-white/15 bg-white/10 text-gray-300 hover:bg-white/20 focus-visible:ring-offset-gray-950"
          : "border-black/10 bg-black/5 text-gray-500 hover:bg-black/10 focus-visible:ring-offset-white"
      }`}
      aria-label={label}
      title={label}
    >
      <Icon
        aria-hidden="true"
        className="h-[18px] w-[18px]"
        strokeWidth={1.9}
      />
    </motion.button>
  );
}
