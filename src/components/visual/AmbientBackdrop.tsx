import { useEffect, useState } from "react";

import { isHexColor, mixOklch } from "../../lib/visual/colorMath";
import { FALLBACK_THEMES } from "../../lib/visual/themeTokens";

interface AmbientBackdropProps {
  /** `dominant_color` (#RRGGBB) of the active photo; invalid/absent = untinted theme background. */
  dominantColor?: string | null;
  /** Theme base the tint is mixed into (defaults to Velada). */
  base?: string;
  /** Tint strength in percent: 30 for Velada, 20 for Sobremesa. */
  strength?: number;
  className?: string;
}

interface Layer {
  color: string | null;
}

/**
 * Two layers swap roles on every change and cross-fade by opacity only, so the
 * transition never animates a paint property and works without @property.
 */
export function AmbientBackdrop({
  dominantColor,
  base = FALLBACK_THEMES.velada.base,
  strength = 30,
  className,
}: AmbientBackdropProps) {
  const tint =
    dominantColor && isHexColor(dominantColor)
      ? mixOklch(dominantColor, base, strength)
      : null;
  const [layers, setLayers] = useState<[Layer, Layer]>([
    { color: tint },
    { color: null },
  ]);
  const [front, setFront] = useState<0 | 1>(0);

  useEffect(() => {
    if (layers[front].color === tint) return;
    const next = front === 0 ? 1 : 0;
    setLayers((prev) => {
      const copy: [Layer, Layer] = [prev[0], prev[1]];
      copy[next] = { color: tint };
      return copy;
    });
    setFront(next);
  }, [tint, front, layers]);

  return (
    <div className={`v-ambient ${className ?? ""}`.trim()} aria-hidden="true">
      {layers.map((layer, index) => (
        <div
          key={index}
          className="v-ambient__layer"
          data-active={front === index && layer.color !== null}
          style={layer.color ? { backgroundColor: layer.color } : undefined}
        />
      ))}
    </div>
  );
}
