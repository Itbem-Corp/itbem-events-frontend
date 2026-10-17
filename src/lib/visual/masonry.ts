export interface MasonryItem {
  id: string;
  /** intrinsic_width / intrinsic_height; null/invalid falls back to 1 (square). */
  width?: number | null;
  height?: number | null;
}

export function aspectRatioOf(item: MasonryItem): number {
  const { width, height } = item;
  if (
    typeof width === "number" &&
    typeof height === "number" &&
    width > 0 &&
    height > 0
  ) {
    return width / height;
  }
  return 1;
}

/**
 * Where an item sits in an N-column layout: its column, the summed heights of
 * the items above it in column widths (`y`), and how many gaps are above it.
 */
export interface MasonrySlot {
  column: number;
  y: number;
  k: number;
}

export interface MasonryLayout {
  slots: MasonrySlot[];
  /** Per column: summed heights in column widths and item count. */
  columns: { y: number; count: number }[];
}

/**
 * Greedy shortest-column placement in arrival order. Heights come from the
 * intrinsic aspect ratio, so the result is known before any image loads and
 * appending items never moves the ones already placed.
 */
export function layoutColumns(
  items: readonly MasonryItem[],
  columnCount: number,
): MasonryLayout {
  const count = Math.max(1, Math.floor(columnCount));
  const columns = Array.from({ length: count }, () => ({ y: 0, count: 0 }));
  const slots = items.map((item) => {
    let target = 0;
    for (let i = 1; i < count; i += 1) {
      if (columns[i].y < columns[target].y) target = i;
    }
    const column = columns[target];
    const slot = { column: target, y: column.y, k: column.count };
    column.y += 1 / aspectRatioOf(item);
    column.count += 1;
    return slot;
  });
  return { slots, columns };
}

export function distributeIntoColumns<T extends MasonryItem>(
  items: readonly T[],
  columnCount: number,
): T[][] {
  const { slots, columns } = layoutColumns(items, columnCount);
  const result: T[][] = columns.map(() => []);
  items.forEach((item, index) => result[slots[index].column].push(item));
  return result;
}

export function columnCountFor(
  containerWidth: number,
  minColumnWidth = 150,
  gap = 8,
  maxColumns = Number.POSITIVE_INFINITY,
): number {
  if (!Number.isFinite(containerWidth) || containerWidth <= 0) return 2;
  return Math.min(
    Math.max(1, Math.floor(maxColumns)),
    Math.max(1, Math.floor((containerWidth + gap) / (minColumnWidth + gap))),
  );
}

/** Smallest container width at which `columnCountFor` reaches `columns`. */
export function minWidthForColumns(
  columns: number,
  minColumnWidth = 150,
  gap = 8,
): number {
  return columns * (minColumnWidth + gap) - gap;
}

export interface MasonryPlacementOptions {
  minColumnWidth: number;
  gap: number;
  maxColumns: number;
}

export interface MasonryPlacement {
  /** Deterministic from the input, so server and client markup match. */
  scope: string;
  css: string;
  /** Per item: its slot for every column count, as CSS custom properties. */
  itemVars: Record<string, string>[];
}

const round = (value: number) => String(Math.round(value * 10000) / 10000);

function hash(text: string): string {
  let h = 5381;
  for (let i = 0; i < text.length; i += 1) h = Math.imul(h, 33) ^ text.charCodeAt(i);
  return (h >>> 0).toString(36);
}

/**
 * Precomputes the shortest-column layout for every column count up to
 * `maxColumns` and lets container queries pick the one for the current width.
 * The first paint (server HTML included) is already the final layout: nothing
 * waits for JavaScript to measure, so nothing moves on hydration.
 */
export function masonryPlacement(
  items: readonly MasonryItem[],
  { minColumnWidth, gap, maxColumns }: MasonryPlacementOptions,
): MasonryPlacement {
  const max = Math.max(1, Math.floor(maxColumns));
  const layouts = Array.from({ length: max }, (_, i) => layoutColumns(items, i + 1));
  const scope = `m${hash(
    `${minColumnWidth}|${gap}|${max}|${items.map((it) => `${it.id}:${aspectRatioOf(it)}`).join(",")}`,
  )}`;
  // Unquoted (scope is an identifier) so the <style> text needs no escaping.
  const sel = `[data-v-masonry=${scope}]`;

  const itemVars = items.map((_, index) => {
    const vars: Record<string, string> = {};
    layouts.forEach((layout, i) => {
      const slot = layout.slots[index];
      vars[`--v-c${i + 1}`] = String(slot.column);
      vars[`--v-y${i + 1}`] = round(slot.y);
      vars[`--v-k${i + 1}`] = String(slot.k);
    });
    return vars;
  });

  const rule = (n: number) => {
    const heights = layouts[n - 1].columns
      .filter((c) => c.count > 0)
      .map((c) => `calc(${round(c.y)} * var(--v-cw) + ${c.count - 1} * var(--v-masonry-gap))`);
    const height = heights.length ? `max(${heights.join(", ")})` : "0px";
    return `${sel} .v-masonry__stage{--v-n:${n};height:${height}}${sel} .v-masonry__item{--v-c:var(--v-c${n});--v-y:var(--v-y${n});--v-k:var(--v-k${n})}`;
  };

  let css = rule(1);
  for (let n = 2; n <= max; n += 1) {
    css += `@container (min-width: ${minWidthForColumns(n, minColumnWidth, gap)}px){${rule(n)}}`;
  }
  return {
    scope,
    css: `@supports (container-type: inline-size) and (not (display: grid-lanes)){${css}}`,
    itemVars,
  };
}
