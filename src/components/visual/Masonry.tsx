import type { CSSProperties, ReactNode } from "react";
import { useMemo } from "react";

import {
  aspectRatioOf,
  masonryPlacement,
  type MasonryItem,
} from "../../lib/visual/masonry";

interface MasonryProps<T extends MasonryItem> {
  items: readonly T[];
  renderItem: (item: T) => ReactNode;
  minColumnWidth?: number;
  gap?: number;
  /** Upper bound of precomputed column counts; wider containers widen columns. */
  maxColumns?: number;
  className?: string;
}

/**
 * `display: grid-lanes` where the browser has it; otherwise the columns are
 * computed shortest-column in arrival order for every column count and a
 * container query picks one. No state and no measuring: the server HTML is
 * the final layout, in DOM (and tab) order of arrival.
 */
export function Masonry<T extends MasonryItem>({
  items,
  renderItem,
  minColumnWidth = 150,
  gap = 8,
  maxColumns = 6,
  className,
}: MasonryProps<T>) {
  const placement = useMemo(
    () => masonryPlacement(items, { minColumnWidth, gap, maxColumns }),
    [items, minColumnWidth, gap, maxColumns],
  );

  const rootStyle = {
    "--v-masonry-gap": `${gap}px`,
    "--v-masonry-min": `${minColumnWidth}px`,
  } as CSSProperties;

  return (
    <div
      className={`v-masonry ${className ?? ""}`.trim()}
      data-v-masonry={placement.scope}
      style={rootStyle}
    >
      <style>{placement.css}</style>
      <div className="v-masonry__stage">
        {items.map((item, index) => (
          <div
            key={item.id}
            className="v-masonry__item"
            style={
              {
                "--v-ratio": String(aspectRatioOf(item)),
                ...placement.itemVars[index],
              } as CSSProperties
            }
          >
            {renderItem(item)}
          </div>
        ))}
      </div>
    </div>
  );
}
