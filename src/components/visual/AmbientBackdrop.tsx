import type { CSSProperties } from "react";
import { useEffect, useState } from "react";

import { isHexColor, mixOklch } from "../../lib/visual/colorMath";
import { useVisualTheme } from "./visualThemeContext";

interface AmbientBackdropProps {
  /** `dominant_color` (#RRGGBB) of the active photo; invalid/absent = untinted theme background. */
  dominantColor?: string | null;
  /** Theme base the tint is mixed into; defaults to the active theme's base seed. */
  base?: string;
  /** Tint strength in percent; defaults to the active theme's (30 Velada, 20 Sobremesa). */
  strength?: number;
  className?: string;
}

interface Layer {
  /** Photo color, or null for an empty layer. */
  seed: string | null;
}

/**
 * Two layers swap roles on every change and cross-fade by opacity only, so the
 * transition never animates a paint property and works without @property.
 * The tint follows the active theme (VisualRoot): Velada, Sobremesa or the
 * event palette.
 */
export function AmbientBackdrop({
  dominantColor,
  base,
  strength,
  className,
}: AmbientBackdropProps) {
  const theme = useVisualTheme();
  const mixBase = base ?? theme.seeds.base;
  const mixStrength = strength ?? theme.tintStrength;
  const seed = dominantColor && isHexColor(dominantColor) ? dominantColor : null;

  const [layers, setLayers] = useState<[Layer, Layer]>([{ seed }, { seed: null }]);
  const [front, setFront] = useState<0 | 1>(0);

  useEffect(() => {
    if (layers[front].seed === seed) return;
    const next = front === 0 ? 1 : 0;
    setLayers((prev) => {
      const copy: [Layer, Layer] = [prev[0], prev[1]];
      copy[next] = { seed };
      return copy;
    });
    setFront(next);
  }, [seed, front, layers]);

  const layerStyle = (layerSeed: string) =>
    ({
      "--v-ambient-seed": layerSeed,
      "--v-ambient-mixed": mixOklch(layerSeed, mixBase, mixStrength),
      "--v-tint-mix": `${mixStrength}%`,
      "--v-seed-base": mixBase,
    }) as CSSProperties;

  return (
    <div className={`v-ambient ${className ?? ""}`.trim()} aria-hidden="true">
      {layers.map((layer, index) => (
        <div
          key={index}
          className="v-ambient__layer"
          data-active={front === index && layer.seed !== null}
          style={layer.seed ? layerStyle(layer.seed) : undefined}
        />
      ))}
    </div>
  );
}
