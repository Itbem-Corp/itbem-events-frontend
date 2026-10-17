import { contrastRatio, isHexColor, relativeLuminance } from "./colorMath";
import { EVENT_KINDS, normalizeEventKind, type EventKind } from "./eventKinds";
import { CURVES } from "./motion";

export type FallbackThemeId = "velada" | "sobremesa";

export interface ThemeSeeds {
  base: string;
  ink: string;
  accent: string;
}

/** Fallback themes used when the event has no usable palette. */
export const FALLBACK_THEMES: Record<FallbackThemeId, ThemeSeeds> = {
  velada: { base: "#0E0B10", ink: "#F5EEE6", accent: "#E8C987" },
  sobremesa: { base: "#F6EADB", ink: "#2A1E17", accent: "#8F4F1D" },
};

export const AA_TEXT = 4.5;
export const AA_LARGE = 3;

export interface VisualTheme {
  source: "palette" | "fallback";
  family: FallbackThemeId;
  kind: EventKind;
  seeds: ThemeSeeds;
  /** Inline custom properties: only seeds; derivations happen in CSS (oklch + color-mix). */
  vars: Record<string, string>;
  attrs: {
    "data-eventi-theme": FallbackThemeId;
    "data-eventi-kind": EventKind;
  };
}

function lookupKey(key: string): string {
  return key
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
}

function firstHex(
  colors: Record<string, string>,
  keys: string[],
): string | undefined {
  for (const key of keys) {
    const value = colors[key]?.trim();
    if (value && isHexColor(value)) return value;
  }
  return undefined;
}

function bestInk(base: string): string {
  const candidates = [FALLBACK_THEMES.velada.ink, FALLBACK_THEMES.sobremesa.ink];
  return candidates.reduce((best, c) =>
    contrastRatio(c, base) > contrastRatio(best, base) ? c : best,
  );
}

/**
 * Resolves seeds from the event palette (`PageTheme.colors`). Anything missing
 * or unreadable falls back to Velada/Sobremesa; ink is corrected to keep AA.
 */
export function resolveVisualTheme(
  colors: Record<string, string> | undefined,
  options: { eventType?: string | null; preferred?: FallbackThemeId } = {},
): VisualTheme {
  const kind = normalizeEventKind(options.eventType);
  const normalized: Record<string, string> = {};
  for (const [key, value] of Object.entries(colors ?? {})) {
    if (typeof value === "string") normalized[lookupKey(key)] = value;
  }

  const paletteBase = firstHex(normalized, [
    "background",
    "background_soft",
    "surface",
  ]);
  const paletteInk = firstHex(normalized, ["text", "foreground", "body"]);
  const paletteAccent = firstHex(normalized, [
    "accent",
    "secondary",
    "gold",
    "primary",
  ]);

  const hasPalette = Boolean(paletteBase ?? paletteAccent ?? paletteInk);
  const fallbackId = options.preferred ?? "velada";
  const fallback = FALLBACK_THEMES[fallbackId];

  let base = paletteBase;
  if (!base) {
    base = paletteInk
      ? contrastRatio(paletteInk, fallback.base) >= AA_TEXT
        ? fallback.base
        : FALLBACK_THEMES[fallbackId === "velada" ? "sobremesa" : "velada"].base
      : fallback.base;
  }

  let ink = paletteInk ?? bestInk(base);
  if (contrastRatio(ink, base) < AA_TEXT) ink = bestInk(base);

  let accent = paletteAccent ?? fallback.accent;
  if (contrastRatio(accent, base) < AA_LARGE) {
    accent = relativeLuminance(base) < 0.3
      ? FALLBACK_THEMES.velada.accent
      : FALLBACK_THEMES.sobremesa.accent;
  }

  const seeds: ThemeSeeds = hasPalette ? { base, ink, accent } : { ...fallback };
  const family: FallbackThemeId =
    relativeLuminance(seeds.base) < 0.3 ? "velada" : "sobremesa";

  return {
    source: hasPalette ? "palette" : "fallback",
    family,
    kind,
    seeds,
    vars: {
      "--v-seed-base": seeds.base,
      "--v-seed-ink": seeds.ink,
      "--v-seed-accent": seeds.accent,
      "--v-kind-tempo": String(EVENT_KINDS[kind].motion.tempo),
      "--v-kind-ease": `cubic-bezier(${CURVES[EVENT_KINDS[kind].motion.curve].join(", ")})`,
    },
    attrs: { "data-eventi-theme": family, "data-eventi-kind": kind },
  };
}
