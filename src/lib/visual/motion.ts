/** Motion tokens from the approved motion-system design (#32 rev 21). Mirrors visual-base.css. */

export const DURATIONS = {
  instante: 90,
  rapida: 160,
  base: 240,
  suave: 360,
  lenta: 560,
  caida: 900,
  revelado: 1200,
  historia: 5000,
  escenaTv: 8000,
} as const;
export type DurationToken = keyof typeof DURATIONS;

export const CURVES = {
  estandar: [0.2, 0, 0, 1],
  entrada: [0.05, 0.7, 0.1, 1],
  salida: [0.3, 0, 0.8, 0.15],
  rebote: [0.34, 1.56, 0.64, 1],
  lineal: [0, 0, 1, 1],
} as const;
export type CurveToken = keyof typeof CURVES;

/**
 * The only properties any animation or transition may touch (EV-31 acceptance
 * criterion: "solo transform y opacity"). filter and clip-path may be set as
 * static values but never animated.
 */
export const ANIMATED_PROPERTIES = ["transform", "opacity"] as const;

export type ReducedBehavior = "fade" | "cut";
export type MotionMode = "full" | "fallback" | "still";

export interface MotionTechnique {
  id: string;
  /** `CSS.supports(...)` arguments; null = baseline, always available. */
  supports: [string, string?] | null;
  /** What runs when the browser lacks the feature. */
  fallback: string;
  /** What a reduced-motion user sees (final state, no travel). */
  still: string;
  /** How reduced motion collapses the effect. */
  reduced: ReducedBehavior;
  /** Duration in ms when `reduced` is `fade`. */
  reducedMs: number;
}

export const MOTION_TECHNIQUES = {
  viewTransitions: {
    id: "view-transitions",
    supports: ["view-transition-name", "foto"],
    fallback: "framer-motion layoutId on the tapped item only, or 240 ms fade",
    still: "90 ms cross-fade, no scale or translate",
    reduced: "fade",
    reducedMs: DURATIONS.instante,
  },
  scrollDriven: {
    id: "scroll-driven",
    supports: ["animation-timeline", "view()"],
    fallback: "IntersectionObserver adds .is-visible: one 360 ms entrance",
    still: "everything rendered complete and visible, nothing moves",
    reduced: "cut",
    reducedMs: 0,
  },
  gridLanes: {
    id: "grid-lanes",
    supports: ["display", "grid-lanes"],
    fallback: "shortest-column slots precomputed per column count, absolutely positioned (left/top from CSS variables, picked by container queries), DOM in arrival order",
    still: "same layout, new items appear without fade",
    reduced: "cut",
    reducedMs: 0,
  },
  colorMix: {
    id: "oklch-color-mix",
    supports: ["color", "color-mix(in oklch, red, blue)"],
    fallback: "seed colors used directly (no derivation)",
    still: "tint changes without transition",
    reduced: "cut",
    reducedMs: 0,
  },
  registeredProperty: {
    id: "property",
    supports: null,
    fallback: "variable jumps; progress uses transform scaleX and text",
    still: "90 ms fade between steps",
    reduced: "fade",
    reducedMs: DURATIONS.instante,
  },
  backdropBlur: {
    id: "backdrop-blur",
    supports: ["backdrop-filter", "blur(1px)"],
    fallback: "solid surface (seed-derived, 94 %)",
    still: "always solid (prefers-reduced-transparency)",
    reduced: "cut",
    reducedMs: 0,
  },
  clipReveal: {
    id: "clip-reveal",
    supports: ["clip-path", "circle(0% at 50% 50%)"],
    fallback: "240 ms fade",
    still: "complete image, 90 ms fade",
    reduced: "fade",
    reducedMs: DURATIONS.instante,
  },
  depth3d: {
    id: "depth-3d",
    supports: ["perspective", "1200px"],
    fallback: "flat plane with soft tilt",
    still: "flat plane, selected item marked with a border",
    reduced: "cut",
    reducedMs: 0,
  },
  containerQueries: {
    id: "container-queries",
    supports: ["container-type", "inline-size"],
    fallback: "compact card (photo and icon)",
    still: "n/a: no motion",
    reduced: "cut",
    reducedMs: 0,
  },
  has: {
    id: "has",
    supports: null,
    fallback: "React sets the same class; :has() is never the only source",
    still: "bar appears without sliding",
    reduced: "cut",
    reducedMs: 0,
  },
  scrollSnap: {
    id: "scroll-snap",
    supports: ["scroll-snap-type", "x mandatory"],
    fallback: "free scroll plus always-visible previous/next buttons",
    still: "scroll-behavior: auto, immediate jump",
    reduced: "cut",
    reducedMs: 0,
  },
} as const satisfies Record<string, MotionTechnique>;
export type MotionTechniqueKey = keyof typeof MOTION_TECHNIQUES;

export interface MotionEnv {
  reducedMotion: boolean;
  conserve: boolean;
}

export function readMotionEnv(
  win: Window | undefined = typeof window === "undefined" ? undefined : window,
): MotionEnv {
  if (!win) return { reducedMotion: false, conserve: false };
  return {
    reducedMotion: win.matchMedia("(prefers-reduced-motion: reduce)").matches,
    conserve:
      win.document.documentElement.dataset.eventiPerformance === "conserve",
  };
}

export function isTechniqueSupported(technique: MotionTechnique): boolean {
  if (!technique.supports) return true;
  if (typeof CSS === "undefined" || typeof CSS.supports !== "function")
    return false;
  const [prop, value] = technique.supports;
  return value === undefined ? CSS.supports(prop) : CSS.supports(prop, value);
}

/**
 * full: native technique with motion. fallback: no support or conserve mode,
 * simpler path with a fade. still: reduced motion, final state only.
 */
export function resolveMotionMode(
  env: MotionEnv,
  supported: boolean,
): MotionMode {
  if (env.reducedMotion) return "still";
  if (env.conserve || !supported) return "fallback";
  return "full";
}

export interface MotionTransition {
  duration: number;
  ease: readonly number[];
}

/** Seconds + cubic-bezier for framer-motion; reduced motion collapses to fade or cut. */
export function transitionFor(
  duration: DurationToken,
  curve: CurveToken,
  mode: MotionMode,
  reduced: ReducedBehavior = "fade",
): MotionTransition {
  if (mode === "still") {
    return {
      duration: reduced === "fade" ? DURATIONS.instante / 1000 : 0,
      ease: CURVES.lineal,
    };
  }
  return { duration: DURATIONS[duration] / 1000, ease: CURVES[curve] };
}
