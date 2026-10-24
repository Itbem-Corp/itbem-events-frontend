import { createContext, useContext } from "react";

import { resolveVisualTheme, type VisualTheme } from "../../lib/visual/themeTokens";

/** Active theme, provided by VisualRoot. Outside a VisualRoot: the no-palette theme. */
export const VisualThemeContext = createContext<VisualTheme | null>(null);

const NO_PALETTE_THEME = resolveVisualTheme(undefined);

export function useVisualTheme(): VisualTheme {
  return useContext(VisualThemeContext) ?? NO_PALETTE_THEME;
}
