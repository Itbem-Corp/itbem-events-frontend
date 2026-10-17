import type { CSSProperties, ReactNode } from "react";
import { useMemo } from "react";

import {
  resolveVisualTheme,
  type FallbackThemeId,
} from "../../lib/visual/themeTokens";

interface VisualRootProps {
  /** `PageTheme.colors` from the event palette; absent = Velada/Sobremesa. */
  colors?: Record<string, string>;
  eventType?: string | null;
  preferredFallback?: FallbackThemeId;
  className?: string;
  children: ReactNode;
}

export function VisualRoot({
  colors,
  eventType,
  preferredFallback,
  className,
  children,
}: VisualRootProps) {
  const theme = useMemo(
    () =>
      resolveVisualTheme(colors, { eventType, preferred: preferredFallback }),
    [colors, eventType, preferredFallback],
  );
  return (
    <div
      className={`eventi-visual ${className ?? ""}`.trim()}
      style={theme.vars as CSSProperties}
      {...theme.attrs}
    >
      {children}
    </div>
  );
}
