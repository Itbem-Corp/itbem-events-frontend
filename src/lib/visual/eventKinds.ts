export type EventKind = "boda" | "quince" | "cumpleanos" | "otro";

export interface EventKindSpec {
  /** Generated background recipe (CSS class in visual-base.css); never fixes colors. */
  background: "petalos" | "destellos" | "confeti" | "bruma";
  /** Typography stack role; resolved to font stacks in visual-base.css. */
  typography: "serif-editorial" | "display-festivo" | "redondeada" | "neutra";
  /** Motion character: which curve leads and how fast decorative motion runs. */
  motion: { curve: "estandar" | "entrada" | "rebote"; tempo: number };
}

export const EVENT_KINDS: Record<EventKind, EventKindSpec> = {
  boda: {
    background: "petalos",
    typography: "serif-editorial",
    motion: { curve: "estandar", tempo: 1.15 },
  },
  quince: {
    background: "destellos",
    typography: "display-festivo",
    motion: { curve: "rebote", tempo: 1 },
  },
  cumpleanos: {
    background: "confeti",
    typography: "redondeada",
    motion: { curve: "rebote", tempo: 0.9 },
  },
  otro: {
    background: "bruma",
    typography: "neutra",
    motion: { curve: "estandar", tempo: 1 },
  },
};

const ALIASES: Record<string, EventKind> = {
  boda: "boda",
  bodas: "boda",
  wedding: "boda",
  quince: "quince",
  quinceanos: "quince",
  quinceanera: "quince",
  xv: "quince",
  cumpleanos: "cumpleanos",
  birthday: "cumpleanos",
};

export function normalizeEventKind(raw?: string | null): EventKind {
  if (!raw) return "otro";
  const key = raw
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  return ALIASES[key] ?? "otro";
}
