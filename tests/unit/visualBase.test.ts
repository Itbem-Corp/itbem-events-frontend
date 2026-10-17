import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Masonry } from "../../src/components/visual/Masonry";
import {
  contrastRatio,
  hexToRgb,
  mixOklch,
} from "../../src/lib/visual/colorMath";
import { EVENT_KINDS, normalizeEventKind } from "../../src/lib/visual/eventKinds";
import {
  aspectRatioOf,
  columnCountFor,
  distributeIntoColumns,
  masonryPlacement,
  minWidthForColumns,
} from "../../src/lib/visual/masonry";
import {
  ANIMATED_PROPERTIES,
  CURVES,
  DURATIONS,
  MOTION_TECHNIQUES,
  resolveMotionMode,
  transitionFor,
} from "../../src/lib/visual/motion";
import {
  AA_TEXT,
  FALLBACK_THEMES,
  resolveVisualTheme,
  TINT_STRENGTH,
} from "../../src/lib/visual/themeTokens";

const css = readFileSync(
  join(process.cwd(), "src/styles/visual-base.css"),
  "utf8",
);

describe("motion tokens", () => {
  it("keeps visual-base.css durations and curves identical to motion.ts", () => {
    for (const [name, ms] of Object.entries(DURATIONS)) {
      const cssName = name === "escenaTv" ? "escena-tv" : name;
      expect(css).toContain(`--v-dur-${cssName}: ${ms}ms;`);
    }
    for (const [name, points] of Object.entries(CURVES)) {
      if (name === "lineal") continue;
      expect(css).toContain(
        `--v-ease-${name}: cubic-bezier(${points.join(", ")});`,
      );
    }
  });

  it("gives every technique a fallback, a still version and fade-or-cut reduction", () => {
    for (const technique of Object.values(MOTION_TECHNIQUES)) {
      expect(technique.fallback.length).toBeGreaterThan(0);
      expect(technique.still.length).toBeGreaterThan(0);
      expect(["fade", "cut"]).toContain(technique.reduced);
      if (technique.reduced === "fade") {
        expect(technique.reducedMs).toBe(DURATIONS.instante);
      }
    }
  });

  it("resolves mode: reduced motion wins, then conserve or missing support", () => {
    expect(resolveMotionMode({ reducedMotion: true, conserve: false }, true)).toBe("still");
    expect(resolveMotionMode({ reducedMotion: false, conserve: true }, true)).toBe("fallback");
    expect(resolveMotionMode({ reducedMotion: false, conserve: false }, false)).toBe("fallback");
    expect(resolveMotionMode({ reducedMotion: false, conserve: false }, true)).toBe("full");
  });

  it("collapses transitions to a 90 ms fade or a cut under reduced motion", () => {
    expect(transitionFor("suave", "entrada", "still").duration).toBe(0.09);
    expect(transitionFor("suave", "entrada", "still", "cut").duration).toBe(0);
    expect(transitionFor("suave", "entrada", "full")).toEqual({
      duration: 0.36,
      ease: CURVES.entrada,
    });
  });
});

describe("animation budget (compositor-only properties)", () => {
  const allowed = new Set<string>(ANIMATED_PROPERTIES);

  it("allows animating only transform and opacity", () => {
    expect([...ANIMATED_PROPERTIES]).toEqual(["transform", "opacity"]);
  });

  it("uses a --v-ease-* token for every animation and transition timing", () => {
    const declarations = [
      ...css.matchAll(/(?:^|[\s;{])(animation|animation-timing-function|transition)\s*:\s*([^;]+);/g),
    ];
    expect(declarations.length).toBeGreaterThan(0);
    for (const [, property, value] of declarations) {
      if (/^none\b/.test(value.trim())) continue;
      expect(value.replace(/var\([^)]*\)/g, ""), `${property}: ${value}`).not.toMatch(
        /\b(linear|ease|ease-in|ease-out|ease-in-out|step-start|step-end)\b|cubic-bezier\(|steps\(/,
      );
    }
  });

  it("animates only transform and opacity in @keyframes", () => {
    const blocks = [...css.matchAll(/@keyframes\s+[\w-]+\s*\{((?:[^{}]|\{[^{}]*\})*)\}/g)];
    expect(blocks.length).toBeGreaterThan(0);
    for (const [, body] of blocks) {
      const declarations = [...body.matchAll(/([a-z-]+)\s*:/g)].map((m) => m[1]);
      for (const property of declarations) {
        expect(allowed.has(property), `keyframe animates "${property}"`).toBe(true);
      }
    }
  });

  it("transitions only transform and opacity", () => {
    const transitions = [...css.matchAll(/transition\s*:\s*([^;]+);/g)];
    expect(transitions.length).toBeGreaterThan(0);
    for (const [, value] of transitions) {
      if (/^none\b/.test(value.trim())) continue;
      for (const part of value.split(",")) {
        const property = part.trim().split(/\s+/)[0];
        expect(allowed.has(property), `transition on "${property}"`).toBe(true);
      }
    }
  });

  it("never uses transition: all or animates layout properties", () => {
    expect(css).not.toMatch(/transition\s*:\s*all\b/);
    expect(css).not.toMatch(/will-change\s*:\s*(width|height|top|left)/);
  });
});

describe("theme tokens", () => {
  it("falls back to Velada when the event has no palette", () => {
    const theme = resolveVisualTheme(undefined);
    expect(theme.source).toBe("fallback");
    expect(theme.family).toBe("velada");
    expect(theme.seeds).toEqual(FALLBACK_THEMES.velada);
  });

  it("falls back to Sobremesa when asked and ignores unreadable palettes", () => {
    const theme = resolveVisualTheme(
      { background: "not-a-color", text: "rgb(1,2,3)" },
      { preferred: "sobremesa" },
    );
    expect(theme.source).toBe("fallback");
    expect(theme.family).toBe("sobremesa");
  });

  it("takes seeds from the event palette and exposes them as custom properties", () => {
    const theme = resolveVisualTheme({
      BACKGROUND_SOFT: "#fff8ec",
      text: "#3a2a1a",
      accent: "#a3541c",
    });
    expect(theme.source).toBe("palette");
    expect(theme.family).toBe("sobremesa");
    expect(theme.vars["--v-seed-base"]).toBe("#fff8ec");
    expect(theme.vars["--v-seed-accent"]).toBe("#a3541c");
  });

  it("corrects an ink that would break AA against the palette background", () => {
    const theme = resolveVisualTheme({ background: "#0f0f12", text: "#222222" });
    expect(contrastRatio(theme.seeds.ink, theme.seeds.base)).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it("meets AA for text and secondary text in both fallback themes", () => {
    for (const seeds of Object.values(FALLBACK_THEMES)) {
      expect(contrastRatio(seeds.ink, seeds.base)).toBeGreaterThanOrEqual(AA_TEXT);
      const inkTwo = mixOklch(seeds.ink, seeds.base, 82);
      expect(contrastRatio(inkTwo, seeds.base)).toBeGreaterThanOrEqual(AA_TEXT);
      expect(contrastRatio(seeds.accent, seeds.base)).toBeGreaterThanOrEqual(AA_TEXT);
    }
  });

  it("keeps text AA on the ambient tint, including the worst case (white dominant)", () => {
    const velada = FALLBACK_THEMES.velada;
    const tinted = mixOklch("#FFFFFF", velada.base, 30);
    expect(contrastRatio(velada.ink, tinted)).toBeGreaterThanOrEqual(AA_TEXT);
    const sobremesa = FALLBACK_THEMES.sobremesa;
    const tintedLight = mixOklch("#000000", sobremesa.base, 20);
    expect(contrastRatio(sobremesa.ink, tintedLight)).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it("gives each theme family its ambient tint strength, mirrored in --v-tint-mix", () => {
    expect(resolveVisualTheme(undefined).tintStrength).toBe(TINT_STRENGTH.velada);
    expect(resolveVisualTheme(undefined, { preferred: "sobremesa" }).tintStrength).toBe(TINT_STRENGTH.sobremesa);
    expect(resolveVisualTheme({ background: "#fff8ec" }).tintStrength).toBe(TINT_STRENGTH.sobremesa);
    for (const [id, strength] of Object.entries(TINT_STRENGTH)) {
      const block = css.match(new RegExp(`\\[data-eventi-theme="${id}"\\]\\s*\\{([^}]*)\\}`))?.[1] ?? "";
      expect(block).toContain(`--v-tint-mix: ${strength}%;`);
    }
    expect(css).toMatch(/color-mix\(in oklch, var\(--v-ambient-seed\) var\(--v-tint-mix\), var\(--v-seed-base\)\)/);
  });

  it("defines both fallback themes in CSS with the same seeds", () => {
    for (const [id, seeds] of Object.entries(FALLBACK_THEMES)) {
      const block = css.match(new RegExp(`\\[data-eventi-theme="${id}"\\]\\s*\\{([^}]*)\\}`))?.[1] ?? "";
      expect(block.toLowerCase()).toContain(`--v-seed-base: ${seeds.base.toLowerCase()}`);
      expect(block.toLowerCase()).toContain(`--v-seed-ink: ${seeds.ink.toLowerCase()}`);
      expect(block.toLowerCase()).toContain(`--v-seed-accent: ${seeds.accent.toLowerCase()}`);
    }
  });

  it("derives theme colors with oklch color-mix inside @supports", () => {
    expect(css).toMatch(/@supports \(color: color-mix\(in oklch, red, blue\)\)/);
    expect(css).toMatch(/color-mix\(in oklch, var\(--v-seed-/);
  });
});

describe("color math", () => {
  it("mixes in oklch: 100% returns the first color, midpoint of black and white is mid grey", () => {
    expect(mixOklch("#E8C987", "#0E0B10", 100)).toBe("#E8C987");
    const mid = hexToRgb(mixOklch("#FFFFFF", "#000000", 50));
    expect(mid.r).toBeGreaterThan(90);
    expect(mid.r).toBeLessThan(130);
    expect(mid.r).toBe(mid.g);
  });
});

describe("event kinds", () => {
  it("normalizes aliases and accents, defaulting to otro", () => {
    expect(normalizeEventKind("Wedding")).toBe("boda");
    expect(normalizeEventKind("quinceañera")).toBe("quince");
    expect(normalizeEventKind("Cumpleaños")).toBe("cumpleanos");
    expect(normalizeEventKind("graduation")).toBe("otro");
    expect(normalizeEventKind(undefined)).toBe("otro");
  });

  it("mirrors each kind's tempo and curve in CSS", () => {
    for (const [kind, spec] of Object.entries(EVENT_KINDS)) {
      const block = css.match(new RegExp(`\\[data-eventi-kind="${kind}"\\]\\s*\\{([^}]*)\\}`))?.[1] ?? "";
      expect(block).toContain(`--v-kind-tempo: ${spec.motion.tempo};`);
      expect(block).toContain(`--v-kind-ease: var(--v-ease-${spec.motion.curve});`);
    }
  });

  it("applies the kind's fonts to body text and titles", () => {
    expect(css).toMatch(/\[data-eventi-kind\]\s*\{\s*font-family:\s*var\(--v-font-body\)/);
    expect(css).toMatch(/\[data-eventi-kind\] :is\(h1, h2, h3, \.v-display\)\s*\{\s*font-family:\s*var\(--v-font-display\)/);
  });

  it("drives drift, scroll entrance and cover timing with the kind's tempo and curve", () => {
    expect(css).toMatch(/\.v-bg-drift\s*\{[^}]*var\(--v-kind-tempo\)/);
    expect(css).toMatch(/\.v-cover__media--in\s*\{[^}]*var\(--v-kind-tempo\)[^}]*var\(--v-kind-ease\)/);
    expect(css).toMatch(/animation: v-scroll-in var\(--v-kind-ease\)/);
    expect(css).toMatch(/\.v-scroll-in\[data-v-io\]\s*\{[^}]*var\(--v-kind-tempo\)\) var\(--v-kind-ease\)/);
  });

  it("consumes every declared token with var(), except the design scale kept for later screens", () => {
    // Design #32 scale published for EV-32+ screens; listed explicitly so any
    // other unused token fails here.
    const designScale = new Set([
      "--v-dur-rapida", "--v-dur-lenta", "--v-dur-caida", "--v-dur-revelado", "--v-dur-historia",
      "--v-ease-salida", "--v-surface", "--v-ink-2", "--v-line", "--v-accent", "--v-accent-ink",
    ]);
    const declared = new Set([...css.matchAll(/(--v-[a-z0-9-]+)\s*:/g)].map((m) => m[1]));
    for (const token of designScale) expect(declared.has(token), token).toBe(true);
    for (const token of declared) {
      if (designScale.has(token)) continue;
      expect(css.includes(`var(${token}`), `${token} declared but never used`).toBe(true);
    }
  });

  it("defines background, typography and motion per kind without fixing colors", () => {
    expect(Object.keys(EVENT_KINDS).sort()).toEqual(["boda", "cumpleanos", "otro", "quince"]);
    for (const spec of Object.values(EVENT_KINDS)) {
      expect(spec.background).toBeTruthy();
      expect(spec.typography).toBeTruthy();
      expect(spec.motion.tempo).toBeGreaterThan(0);
      expect(JSON.stringify(spec)).not.toMatch(/#[0-9a-f]{3,6}/i);
    }
    const kindBlocks = css.match(/\[data-eventi-kind="[a-z]+"\]\s*\{[^}]*\}/g) ?? [];
    expect(kindBlocks).toHaveLength(4);
    expect(kindBlocks.join("")).not.toMatch(/#[0-9a-f]{3,6}\b/i);
  });
});

describe("masonry fallback", () => {
  const items = [
    { id: "a", width: 1000, height: 1500 },
    { id: "b", width: 1500, height: 1000 },
    { id: "c", width: 1000, height: 1000 },
    { id: "d", width: null, height: null },
    { id: "e", width: 800, height: 2000 },
  ];

  it("treats missing or invalid sizes as square", () => {
    expect(aspectRatioOf({ id: "x", width: 0, height: 10 })).toBe(1);
    expect(aspectRatioOf({ id: "x", width: null, height: null })).toBe(1);
  });

  it("places by shortest column and keeps every item exactly once", () => {
    const columns = distributeIntoColumns(items, 2);
    expect(columns.flat().map((i) => i.id).sort()).toEqual(["a", "b", "c", "d", "e"]);
    expect(columns[0][0].id).toBe("a");
    expect(columns[1][0].id).toBe("b");
  });

  it("does not move already placed items when new ones arrive", () => {
    const before = distributeIntoColumns(items.slice(0, 4), 3);
    const after = distributeIntoColumns(items, 3);
    for (let col = 0; col < 3; col += 1) {
      expect(after[col].slice(0, before[col].length)).toEqual(before[col]);
    }
  });

  it("computes column count from width", () => {
    expect(columnCountFor(0)).toBe(2);
    expect(columnCountFor(390)).toBe(2);
    expect(columnCountFor(1200)).toBe(7);
  });

  it("uses display: grid-lanes where supported and computed columns otherwise", () => {
    expect(css).toMatch(/@supports \(display: grid-lanes\)\s*\{\s*\.v-masonry__stage\s*\{[^}]*display:\s*grid-lanes/);
    expect(css).toMatch(
      /@supports \(container-type: inline-size\) and \(not \(display: grid-lanes\)\)\s*\{[^@]*\.v-masonry__item\s*\{[^}]*position:\s*absolute/,
    );
  });

  it("has no fixed-position layer, so the budget page's absolute background matches the product", () => {
    expect(css).not.toMatch(/position:\s*fixed/);
  });

  it("puts the container-query breakpoints exactly where columnCountFor changes", () => {
    for (let n = 2; n <= 6; n += 1) {
      const width = minWidthForColumns(n, 150, 8);
      expect(columnCountFor(width, 150, 8)).toBe(n);
      expect(columnCountFor(width - 1, 150, 8)).toBe(n - 1);
    }
    expect(columnCountFor(5000, 150, 8, 6)).toBe(6);
  });

  it("precomputes each column count's slots from the same shortest-column placement", () => {
    const { itemVars, css: placementCss } = masonryPlacement(items, {
      minColumnWidth: 150,
      gap: 8,
      maxColumns: 4,
    });
    for (let n = 1; n <= 4; n += 1) {
      const columns = distributeIntoColumns(items, n);
      columns.forEach((column, c) => {
        let y = 0;
        column.forEach((item, k) => {
          const vars = itemVars[items.indexOf(item)];
          expect(vars[`--v-c${n}`]).toBe(String(c));
          expect(vars[`--v-k${n}`]).toBe(String(k));
          expect(Number(vars[`--v-y${n}`])).toBeCloseTo(y, 3);
          y += 1 / aspectRatioOf(item);
        });
      });
      if (n > 1) expect(placementCss).toContain(`@container (min-width: ${minWidthForColumns(n, 150, 8)}px)`);
    }
    expect(placementCss.startsWith("@supports (container-type: inline-size) and (not (display: grid-lanes))")).toBe(true);
  });
});

describe("masonry server render", () => {
  const items = Array.from({ length: 12 }, (_, i) => ({
    id: `m${i}`,
    width: [1000, 1500, 800][i % 3],
    height: [1500, 1000, 800][i % 3],
  }));
  const render = (list = items) =>
    renderToString(
      createElement(Masonry, {
        items: list,
        renderItem: (item: { id: string }) => createElement("img", { alt: "", "data-id": item.id }),
      }),
    );

  it("ships every item, in arrival order, with its placement in the server HTML", () => {
    const html = render();
    const ids = [...html.matchAll(/data-id="(m\d+)"/g)].map((m) => m[1]);
    expect(ids).toEqual(items.map((i) => i.id));
    expect(html).toContain("<style>@supports (container-type: inline-size)");
    expect(html).toMatch(/class="v-masonry__item" style="--v-ratio:[^"]*--v-c1:0;--v-y1:0;--v-k1:0/);
    expect(html).not.toContain("v-masonry__col");
  });

  it("renders the same markup every time, so hydration has nothing to change", () => {
    expect(render()).toBe(render());
    expect(render(items.slice(0, 11))).not.toBe(render());
  });

  it("has no client-only layout state or measuring", () => {
    const source = readFileSync(join(process.cwd(), "src/components/visual/Masonry.tsx"), "utf8");
    expect(source).not.toMatch(/useState|useEffect|useLayoutEffect|ResizeObserver|clientWidth/);
  });
});

describe("reduced motion and conserve coverage", () => {
  const reduced = css.slice(css.lastIndexOf("@media (prefers-reduced-motion: reduce)"));

  it("places the reduced-motion block last and neutralises every motion class", () => {
    for (const selector of [".v-scroll-in", ".v-bg-drift", ".v-ken-burns", ".v-ambient__layer", ".v-table__card"]) {
      expect(reduced).toContain(selector);
    }
    expect(reduced).toContain("::view-transition-group(*)");
    expect(reduced).toMatch(/animation-duration:\s*var\(--v-dur-instante\)/);
  });

  it("guards scroll-driven animations with @supports and a no-support path", () => {
    expect(css).toMatch(/@supports \(animation-timeline: view\(\)\)/);
    expect(css).toMatch(/@supports not \(animation-timeline: view\(\)\)/);
  });

  it("turns blur into a solid surface under conserve and reduced transparency", () => {
    expect(css).toMatch(/prefers-reduced-transparency: no-preference/);
    expect(css).toMatch(/html:not\(\[data-eventi-performance="conserve"\]\) \.v-glass/);
  });
});
