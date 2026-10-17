import type { CSSProperties, ReactNode } from "react";
import { useState } from "react";

export interface FocalPoint {
  /** 0-100, percent from the left. */
  x: number;
  /** 0-100, percent from the top. */
  y: number;
}

interface FullBleedCoverProps {
  /** Event cover image. Absent or failing = generated background from palette and event kind. */
  src?: string | null;
  alt?: string;
  focalPoint?: FocalPoint;
  /** Hero cover is the LCP element: load it eagerly. */
  priority?: boolean;
  className?: string;
  children?: ReactNode;
}

const clampPercent = (value: number) =>
  Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : 50;

export function FullBleedCover({
  src,
  alt = "",
  focalPoint,
  priority = true,
  className,
  children,
}: FullBleedCoverProps) {
  const [failed, setFailed] = useState(false);
  const showImage = Boolean(src) && !failed;
  const style = {
    "--v-focal-x": `${clampPercent(focalPoint?.x ?? 50)}%`,
    "--v-focal-y": `${clampPercent(focalPoint?.y ?? 50)}%`,
  } as CSSProperties;

  return (
    <section
      className={`v-cover ${showImage ? "" : "v-bg"} ${className ?? ""}`.trim()}
      style={style}
      data-cover={showImage ? "image" : "generated"}
    >
      {showImage && (
        <img
          className="v-cover__media v-cover__media--in"
          src={src ?? undefined}
          alt={alt}
          decoding="async"
          loading={priority ? "eager" : "lazy"}
          fetchPriority={priority ? "high" : "auto"}
          onError={() => setFailed(true)}
        />
      )}
      <div className="v-cover__scrim" aria-hidden="true" />
      <div className="v-cover__content">{children}</div>
    </section>
  );
}
