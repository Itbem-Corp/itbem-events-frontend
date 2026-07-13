import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import LegacyHero from "../../src/components/sections/LegacyHero";
import LegacyMap from "../../src/components/sections/LegacyMap";
import LegacyText from "../../src/components/sections/LegacyText";

const baseProps = {
  sectionId: "section-1",
  EVENTS_URL: "https://api.example.com/",
};

describe("legacy dashboard sections", () => {
  it("renders HERO config text without requiring resources first", () => {
    const html = renderToStaticMarkup(
      React.createElement(LegacyHero, {
        ...baseProps,
        config: {
          title: "Fiesta de lanzamiento",
          subtitle: "Nos vemos pronto",
          content: "Entrada libre",
        },
      }),
    );

    expect(html).toContain("Fiesta de lanzamiento");
    expect(html).toContain("Nos vemos pronto");
    expect(html).toContain("Entrada libre");
  });

  it("renders TEXT content with line breaks preserved", () => {
    const html = renderToStaticMarkup(
      React.createElement(LegacyText, {
        ...baseProps,
        config: {
          title: "Aviso",
          content: "Primera linea\nSegunda linea",
        },
      }),
    );

    expect(html).toContain("Aviso");
    expect(html).toContain("Primera linea");
    expect(html).toContain("Segunda linea");
  });

  it("renders MAP config as an embedded map", () => {
    const mapUrl = "https://maps.google.com/maps?q=evento&output=embed";
    const html = renderToStaticMarkup(
      React.createElement(LegacyMap, {
        ...baseProps,
        config: {
          title: "Ubicacion",
          content: "Te esperamos aqui",
          mapUrl,
        },
      }),
    );

    expect(html).toContain("Ubicacion");
    expect(html).toContain("Te esperamos aqui");
    expect(html).toContain(mapUrl.replaceAll("&", "&amp;"));
  });
});
