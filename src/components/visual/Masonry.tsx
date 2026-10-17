import type { CSSProperties, ReactNode } from "react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import {
  columnCountFor,
  distributeIntoColumns,
  aspectRatioOf,
  type MasonryItem,
} from "../../lib/visual/masonry";
import { MOTION_TECHNIQUES, isTechniqueSupported } from "../../lib/visual/motion";

interface MasonryProps<T extends MasonryItem> {
  items: readonly T[];
  renderItem: (item: T) => ReactNode;
  minColumnWidth?: number;
  gap?: number;
  className?: string;
}

const useIsomorphicLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

const itemStyle =(item: MasonryItem) =>
  ({ "--v-ratio": String(aspectRatioOf(item)) }) as CSSProperties;

/**
 * `display: grid-lanes` where the browser has it; otherwise flex columns whose
 * assignment is computed from intrinsic sizes in arrival order. Each tile
 * reserves its aspect ratio, so nothing jumps when images load.
 */
export function Masonry<T extends MasonryItem>({
  items,
  renderItem,
  minColumnWidth = 150,
  gap = 8,
  className,
}: MasonryProps<T>) {
  const ref = useRef<HTMLDivElement>(null);
  // Mode and column count are resolved in layout effects, which re-render
  // before the browser paints the first client frame (same initial state on
  // server and client, so hydration matches).
  const [lanes, setLanes] = useState(false);
  const [columnCount, setColumnCount] = useState<number | null>(null);

  useIsomorphicLayoutEffect(() => {
    setLanes(isTechniqueSupported(MOTION_TECHNIQUES.gridLanes));
  }, []);

  useIsomorphicLayoutEffect(() => {
    const el = ref.current;
    if (!el || lanes) return;
    const update = () =>
      setColumnCount(columnCountFor(el.clientWidth, minColumnWidth, gap));
    // Measured synchronously before the first paint: no 2-column frame.
    update();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [lanes, minColumnWidth, gap]);

  // Until measured, no columns are emitted, so a wrong count (the old fixed
  // 2) is never painted and then reflowed.
  const columns = useMemo(
    () =>
      lanes || columnCount === null
        ? []
        : distributeIntoColumns(items, columnCount),
    [lanes, items, columnCount],
  );

  const rootStyle = {
    "--v-masonry-gap": `${gap}px`,
    gridTemplateColumns: lanes
      ? `repeat(auto-fill, minmax(${minColumnWidth}px, 1fr))`
      : undefined,
  } as CSSProperties;

  return (
    <div
      ref={ref}
      className={`v-masonry ${className ?? ""}`.trim()}
      data-lanes={lanes}
      style={rootStyle}
    >
      {lanes
        ? items.map((item) => (
            <div key={item.id} className="v-masonry__item" style={itemStyle(item)}>
              {renderItem(item)}
            </div>
          ))
        : columns.map((column, index) => (
            <div key={index} className="v-masonry__col">
              {column.map((item) => (
                <div
                  key={item.id}
                  className="v-masonry__item"
                  style={itemStyle(item)}
                >
                  {renderItem(item)}
                </div>
              ))}
            </div>
          ))}
    </div>
  );
}
