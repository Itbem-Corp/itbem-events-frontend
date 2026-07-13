import type { PageTheme } from "../components/engine/types";
import { resolvePublicMediaUrl } from "./mediaUrl";

export type PageThemeStyle = Record<string, string>;

export function normalizeThemeVarKey(key: string): string {
  return key
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
}

function normalizeThemeLookupKey(key: string): string {
  return key
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
}

function normalizeThemeTokens(
  values: Record<string, string> | undefined,
): Record<string, string> {
  const normalized: Record<string, string> = {};
  for (const [key, value] of Object.entries(values ?? {})) {
    const normalizedKey = normalizeThemeLookupKey(key);
    if (normalizedKey && value) normalized[normalizedKey] = value;
  }
  return normalized;
}

function quoteFontFamily(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (
    trimmed.startsWith("var(") ||
    trimmed.startsWith("'") ||
    trimmed.startsWith('"')
  ) {
    return trimmed;
  }
  return trimmed.includes(" ")
    ? `"${trimmed.replaceAll('"', '\\"')}"`
    : trimmed;
}

function cssString(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function fontFaceFamilyName(value: string): string {
  const trimmed = value.trim();
  if (!trimmed || trimmed.startsWith("var(")) return "";
  const firstFamily = trimmed.split(",")[0]?.trim() ?? "";
  return firstFamily.replace(/^['"]|['"]$/g, "");
}

function fontFormatFromUrl(value: string): string {
  let pathname = value;
  try {
    pathname = new URL(value).pathname;
  } catch {
    pathname = value.split(/[?#]/)[0] ?? value;
  }

  const lower = pathname.toLowerCase();
  if (lower.endsWith(".woff2")) return "woff2";
  if (lower.endsWith(".woff")) return "woff";
  if (lower.endsWith(".ttf")) return "truetype";
  if (lower.endsWith(".otf")) return "opentype";
  if (lower.endsWith(".eot")) return "embedded-opentype";
  return "";
}

function firstThemeToken(
  values: Record<string, string> | undefined,
  keys: string[],
) {
  if (!values) return undefined;
  for (const key of keys) {
    const direct = values[key];
    if (direct) return direct;
  }
  return undefined;
}

const TEMPLATE_FONT_PRESETS: Record<
  string,
  { heading: string; accent: string; body: string }
> = {
  "editorial-romance": {
    heading: "Georgia",
    accent: "Georgia",
    body: "Trebuchet MS",
  },
  "contemporary-night": {
    heading: "Arial",
    accent: "Arial",
    body: "Arial",
  },
  "warm-celebration": {
    heading: "Georgia",
    accent: "Trebuchet MS",
    body: "Trebuchet MS",
  },
};

export function buildPageThemeStyle(
  theme?: PageTheme,
): PageThemeStyle | undefined {
  if (!theme) return undefined;

  const style: PageThemeStyle = {};
  const colors = normalizeThemeTokens(theme.colors);
  const fonts = normalizeThemeTokens(theme.fonts);
  const templateFonts = theme.designTemplateIdentifier
    ? TEMPLATE_FONT_PRESETS[theme.designTemplateIdentifier]
    : undefined;

  for (const [key, value] of Object.entries(colors)) {
    const normalized = normalizeThemeVarKey(key);
    if (normalized && value) style[`--eventi-color-${normalized}`] = value;
  }
  for (const [key, value] of Object.entries(fonts)) {
    const normalized = normalizeThemeVarKey(key);
    const family = quoteFontFamily(value);
    if (normalized && family) style[`--eventi-font-${normalized}`] = family;
  }

  const background = firstThemeToken(colors, [
    "background",
    "background_soft",
    "surface",
  ]);
  const surface = firstThemeToken(colors, [
    "surface",
    "background_soft",
    "background",
  ]);
  const text = firstThemeToken(colors, [
    "text",
    "foreground",
    "body",
    "primary",
  ]);
  const heading = firstThemeToken(colors, [
    "heading",
    "title",
    "primary",
    "text",
  ]);
  const accent = firstThemeToken(colors, [
    "accent",
    "secondary",
    "gold",
    "primary",
  ]);
  const muted = firstThemeToken(colors, [
    "muted",
    "caption",
    "secondary",
    "text",
    "primary",
  ]);
  const border = firstThemeToken(colors, [
    "border",
    "line",
    "accent",
    "secondary",
    "primary",
  ]);

  const bodyFont =
    firstThemeToken(fonts, ["body", "base"]) ?? templateFonts?.body;
  const headingFont =
    firstThemeToken(fonts, ["heading", "title", "accent", "body"]) ??
    templateFonts?.heading;
  const accentFont =
    firstThemeToken(fonts, ["accent", "display", "heading", "body"]) ??
    templateFonts?.accent;

  if (background) style.backgroundColor = background;
  if (text) style.color = text;
  if (surface) style["--eventi-color-surface"] = surface;
  if (text) style["--eventi-color-body"] = text;
  if (heading) style["--eventi-color-heading"] = heading;
  if (accent) style["--eventi-color-accent"] = accent;
  if (muted) style["--eventi-color-muted"] = muted;
  if (border) style["--eventi-color-border"] = border;
  if (headingFont)
    style["--eventi-font-heading-effective"] = quoteFontFamily(headingFont);
  if (accentFont)
    style["--eventi-font-accent-effective"] = quoteFontFamily(accentFont);
  if (bodyFont) {
    const quotedBody = quoteFontFamily(bodyFont);
    style["--eventi-font-body-effective"] = quotedBody;
    style.fontFamily = `${quotedBody}, var(--eventi-font-body-fallback, Quicksand, system-ui, sans-serif)`;
  }

  return Object.keys(style).length > 0 ? style : undefined;
}

export function buildPageThemeFontFaces(
  theme: PageTheme | undefined,
  eventsUrl: string,
): string | undefined {
  if (!theme?.fontUrls && !theme?.fontViewUrls) return undefined;

  const fonts = normalizeThemeTokens(theme.fonts);
  const fontUrls = {
    ...normalizeThemeTokens(theme.fontUrls),
    ...normalizeThemeTokens(theme.fontViewUrls),
  };
  const rules: string[] = [];

  for (const [key, value] of Object.entries(fontUrls)) {
    const family = fontFaceFamilyName(fonts[key] ?? "");
    const url = resolvePublicMediaUrl(value, eventsUrl);
    if (!family || !url) continue;

    const format = fontFormatFromUrl(url);
    const formatPart = format ? ` format(${cssString(format)})` : "";
    rules.push(
      `@font-face{font-family:${cssString(family)};src:url(${cssString(url)})${formatPart};font-display:swap;}`,
    );
  }

  return rules.length > 0 ? rules.join("\n") : undefined;
}
