import { describe, expect, it } from "vitest";

import {
  buildPageThemeFontFaces,
  buildPageThemeStyle,
  normalizeThemeVarKey,
} from "../../src/lib/pageTheme";

describe("pageTheme", () => {
  it("normalizes backend theme keys for CSS variables", () => {
    expect(normalizeThemeVarKey("BACKGROUND_SOFT")).toBe("background-soft");
    expect(normalizeThemeVarKey("heading font")).toBe("heading-font");
    expect(normalizeThemeVarKey("primary/accent")).toBe("primaryaccent");
  });

  it("builds root styles and CSS variables from PageSpec theme metadata", () => {
    const style = buildPageThemeStyle({
      designTemplateIdentifier: "classic-elegant",
      colors: {
        primary: "#c8a45d",
        background_soft: "#fff8ec",
      },
      fonts: {
        heading: "Cormorant Garamond",
        body: "Inter",
      },
    });

    expect(style).toEqual({
      "--eventi-color-primary": "#c8a45d",
      "--eventi-color-background-soft": "#fff8ec",
      "--eventi-font-heading": '"Cormorant Garamond"',
      "--eventi-font-body": "Inter",
      backgroundColor: "#fff8ec",
      color: "#c8a45d",
      "--eventi-color-surface": "#fff8ec",
      "--eventi-color-body": "#c8a45d",
      "--eventi-color-heading": "#c8a45d",
      "--eventi-color-accent": "#c8a45d",
      "--eventi-color-muted": "#c8a45d",
      "--eventi-color-border": "#c8a45d",
      "--eventi-font-heading-effective": '"Cormorant Garamond"',
      "--eventi-font-accent-effective": '"Cormorant Garamond"',
      "--eventi-font-body-effective": "Inter",
      fontFamily:
        "Inter, var(--eventi-font-body-fallback, Quicksand, system-ui, sans-serif)",
    });
  });

  it("resolves theme aliases from uppercase and hyphenated backend keys", () => {
    const style = buildPageThemeStyle({
      colors: {
        PRIMARY: "#111111",
        "BACKGROUND-SOFT": "#eeeeee",
        Accent: "#c8a45d",
      },
      fonts: {
        HEADING: "Playfair Display",
        BODY: "Inter",
      },
    });

    expect(style).toMatchObject({
      "--eventi-color-primary": "#111111",
      "--eventi-color-background-soft": "#eeeeee",
      "--eventi-color-accent": "#c8a45d",
      backgroundColor: "#eeeeee",
      color: "#111111",
      "--eventi-font-heading-effective": '"Playfair Display"',
      "--eventi-font-body-effective": "Inter",
    });
  });

  it.each([
    {
      identifier: "editorial-romance",
      background: "#FFF8F5",
      surface: "#FFFFFF",
      text: "#24303A",
      heading: "#102F3F",
      accent: "#DD2284",
      muted: "#6B7F89",
      border: "#E9D6DE",
    },
    {
      identifier: "contemporary-night",
      background: "#09090B",
      surface: "#18181B",
      text: "#F4F4F5",
      heading: "#FFFFFF",
      accent: "#A78BFA",
      muted: "#A1A1AA",
      border: "#3F3F46",
    },
    {
      identifier: "warm-celebration",
      background: "#FFF9ED",
      surface: "#FFFFFF",
      text: "#3D2C22",
      heading: "#6B3A25",
      accent: "#D97706",
      muted: "#8A6F60",
      border: "#E8D1B8",
    },
  ])("renders the published $identifier palette as effective public theme tokens", (theme) => {
    const style = buildPageThemeStyle({
      designTemplateIdentifier: theme.identifier,
      colors: {
        background: theme.background,
        surface: theme.surface,
        text: theme.text,
        heading: theme.heading,
        accent: theme.accent,
        muted: theme.muted,
        border: theme.border,
      },
    });

    expect(style).toMatchObject({
      backgroundColor: theme.background,
      color: theme.text,
      "--eventi-color-surface": theme.surface,
      "--eventi-color-body": theme.text,
      "--eventi-color-heading": theme.heading,
      "--eventi-color-accent": theme.accent,
      "--eventi-color-muted": theme.muted,
      "--eventi-color-border": theme.border,
    });
    expect(style?.["--eventi-font-heading-effective"]).toBeTruthy();
    expect(style?.["--eventi-font-accent-effective"]).toBeTruthy();
    expect(style?.["--eventi-font-body-effective"]).toBeTruthy();
    expect(style?.fontFamily).toContain("var(--eventi-font-body-fallback");
  });

  it("builds font-face rules from backend font URLs", () => {
    const css = buildPageThemeFontFaces(
      {
        fonts: {
          HEADING: "Cormorant Garamond",
          body: "Inter",
        },
        fontUrls: {
          HEADING: "base/fonts/cormorant.woff2",
          body: "https://cdn.example.com/inter.ttf?sig=abc",
        },
      },
      "https://events.example.com/api",
    );

    expect(css).toContain('font-family:"Cormorant Garamond"');
    expect(css).toContain(
      'url("https://events.example.com/storage/base/fonts/cormorant.woff2") format("woff2")',
    );
    expect(css).toContain('font-family:"Inter"');
    expect(css).toContain(
      'url("https://cdn.example.com/inter.ttf?sig=abc") format("truetype")',
    );
  });

  it("prefers signed backend font view URLs over raw storage paths", () => {
    const css = buildPageThemeFontFaces(
      {
        fonts: {
          heading: "Cormorant Garamond",
        },
        fontUrls: {
          heading: "base/fonts/cormorant.woff2",
        },
        fontViewUrls: {
          heading:
            "https://signed.example.com/base/fonts/cormorant.woff2?sig=abc",
        },
      },
      "https://events.example.com/api",
    );

    expect(css).toContain(
      'url("https://signed.example.com/base/fonts/cormorant.woff2?sig=abc") format("woff2")',
    );
    expect(css).not.toContain(
      "https://events.example.com/storage/base/fonts/cormorant.woff2",
    );
  });

  it("does not emit font-face rules without matching font families", () => {
    expect(
      buildPageThemeFontFaces(
        {
          fontUrls: {
            heading: "base/fonts/cormorant.woff2",
          },
        },
        "https://events.example.com",
      ),
    ).toBeUndefined();
  });
});
