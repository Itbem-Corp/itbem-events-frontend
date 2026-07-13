"use client";

import { Music2, Pause, Play } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ComponentType,
  type MouseEvent,
} from "react";
import type { PropTypes as ReactHowlerProps } from "react-howler";

interface MusicWidgetProps {
  audioUrl: string;
  volume?: number;
}

export default function MusicWidget({
  audioUrl,
  volume = 0.8,
}: MusicWidgetProps) {
  const [playing, setPlaying] = useState(false);
  const [Howler, setHowler] =
    useState<ComponentType<ReactHowlerProps> | null>(null);
  const howlerPromiseRef =
    useRef<Promise<ComponentType<ReactHowlerProps>> | null>(null);
  const shouldReduceMotion = useReducedMotion();

  const loadHowler = useCallback(async () => {
    if (!howlerPromiseRef.current) {
      howlerPromiseRef.current = import("react-howler").then(
        (module) => module.default,
      );
    }
    const Component = await howlerPromiseRef.current;
    setHowler(
      (current: ComponentType<ReactHowlerProps> | null) =>
        current ?? Component,
    );
  }, []);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) setPlaying(false);
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  const togglePlayback = async (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    await loadHowler();
    setPlaying((current) => !current);
  };

  return (
    <>
      {Howler && (
        <Howler src={audioUrl} playing={playing} loop volume={volume} />
      )}

      <motion.div
        initial={shouldReduceMotion ? false : { opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: shouldReduceMotion ? 0 : 0.24, ease: "easeOut" }}
        className="fixed bottom-[var(--eventi-safe-bottom)] left-4 z-[45] sm:left-5"
      >
        <motion.button
          onClick={togglePlayback}
          whileHover={shouldReduceMotion ? undefined : { y: -2 }}
          whileTap={shouldReduceMotion ? undefined : { scale: 0.96 }}
          className="eventi-floating-control group relative transition-colors motion-reduce:transition-none"
          aria-label={playing ? "Pausar música" : "Reproducir música"}
          aria-pressed={playing}
          type="button"
        >
          <AnimatePresence>
            {playing && !shouldReduceMotion && (
              <motion.span
                aria-hidden="true"
                className="absolute inset-1 rounded-full border border-[#dd2284]/[0.35]"
                initial={{ scale: 0.88, opacity: 0.65 }}
                animate={{ scale: 1.38, opacity: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 1.8, ease: "easeOut", repeat: Infinity }}
              />
            )}
          </AnimatePresence>

          <span
            aria-hidden="true"
            className="absolute -right-0.5 -top-0.5 flex size-4 items-center justify-center rounded-full bg-[#dd2284] text-white shadow-sm"
          >
            <Music2 className="size-2.5" strokeWidth={2.2} />
          </span>

          <span className="relative flex items-center justify-center text-[var(--eventi-color-heading,var(--eventi-ink))]">
            {playing ? (
              <Pause aria-hidden="true" className="size-5" fill="currentColor" />
            ) : (
              <Play
                aria-hidden="true"
                className="ml-0.5 size-5"
                fill="currentColor"
              />
            )}
          </span>
        </motion.button>
      </motion.div>
    </>
  );
}
