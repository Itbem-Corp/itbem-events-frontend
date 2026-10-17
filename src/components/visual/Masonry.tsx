import type { CSSProperties, ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";

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

const itemStyle = (item: MasonryItem) =>
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
  const [lanes, setLanes] = useState(false);
  const [columnCount, setColumnCount] = useState(2);

  useEffect(() => {
    setLanes(isTechniqueSupported(MOTION_TECHNIQUES.gridLanes));
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el || lanes || typeof ResizeObserver === "undefined") return;
    const update = () =>
      setColumnCount(columnCountFor(el.clientWidth, minColumnWidth, gap));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [lanes, minColumnWidth, gap]);

  const columns = useMemo(
    () => (lanes ? [] : distributeIntoColumns(items, columnCount)),
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
