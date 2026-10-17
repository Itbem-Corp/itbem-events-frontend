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
 * Greedy shortest-column placement in arrival order. Heights come from the
 * intrinsic aspect ratio, so the result is known before any image loads and
 * appending items never moves the ones already placed.
 */
export function distributeIntoColumns<T extends MasonryItem>(
  items: readonly T[],
  columnCount: number,
): T[][] {
  const count = Math.max(1, Math.floor(columnCount));
  const columns: T[][] = Array.from({ length: count }, () => []);
  const heights = new Array<number>(count).fill(0);
  for (const item of items) {
    let target = 0;
    for (let i = 1; i < count; i += 1) {
      if (heights[i] < heights[target]) target = i;
    }
    columns[target].push(item);
    heights[target] += 1 / aspectRatioOf(item);
  }
  return columns;
}

export function columnCountFor(
  containerWidth: number,
  minColumnWidth = 150,
  gap = 8,
): number {
  if (!Number.isFinite(containerWidth) || containerWidth <= 0) return 2;
  return Math.max(
    1,
    Math.floor((containerWidth + gap) / (minColumnWidth + gap)),
  );
}
