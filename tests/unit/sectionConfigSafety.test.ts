import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import AgendaSection, {
  normalizeAgendaItems,
} from "../../src/components/sections/AgendaSection";
import CountdownHeader from "../../src/components/sections/CountdownHeader";
import GraduationHero from "../../src/components/sections/GraduationHero";
import LegacyHero from "../../src/components/sections/LegacyHero";
import LegacyText from "../../src/components/sections/LegacyText";
import LegacyMap from "../../src/components/sections/LegacyMap";
import { calculateCountdownTimeLeft } from "../../src/lib/countdown";
import {
  configList,
  configText,
  configTextOr,
  readConfigText,
} from "../../src/lib/sectionConfig";

const baseProps = {
  sectionId: "section-1",
  EVENTS_URL: "https://api.example.com/",
};

function render(
  component: React.ComponentType<any>,
  config: Record<string, unknown>,
): string {
  return renderToStaticMarkup(
    React.createElement(component, { ...baseProps, config }),
  );
}

describe("sectionConfig helpers", () => {
  it("keeps strings and finite numbers, drops everything else", () => {
    expect(configText("Hola")).toBe("Hola");
    expect(configText(2026)).toBe("2026");
    expect(configText({ a: 1 })).toBeUndefined();
    expect(configText(null)).toBeUndefined();
    expect(configText(["x"])).toBeUndefined();
    expect(configText(Number.NaN)).toBeUndefined();
  });

  it("falls back for blank or invalid text", () => {
    expect(configTextOr("  ", "Momentos")).toBe("Momentos");
    expect(configTextOr({}, "Momentos")).toBe("Momentos");
    expect(configTextOr("Fotos", "Momentos")).toBe("Fotos");
  });

  it("reads several fields from a non-object config", () => {
    expect(readConfigText(null, ["title"])).toEqual({ title: undefined });
    expect(readConfigText({ title: { a: 1 }, content: "x" }, ["title", "content"])).toEqual({
      title: undefined,
      content: "x",
    });
  });

  it("only accepts arrays as lists", () => {
    expect(configList("nope")).toEqual([]);
    expect(configList(null)).toEqual([]);
    expect(configList([1])).toEqual([1]);
  });
});

describe("AgendaSection (STU-1, STU-5)", () => {
  it("renders nothing, not a permanent skeleton, when there are no activities", () => {
    expect(render(AgendaSection, { title: "Agenda", items: [] })).toBe("");
    expect(render(AgendaSection, { title: "Agenda" })).toBe("");
  });

  it("survives a non-array items value", () => {
    expect(() => render(AgendaSection, { items: "nope" })).not.toThrow();
    expect(render(AgendaSection, { items: "nope" })).toBe("");
    const html = render(AgendaSection, { items: null, content: "Ceremonia 18:00" });
    expect(html).toContain("Ceremonia 18:00");
  });

  it("drops malformed rows and coerces text fields", () => {
    expect(
      normalizeAgendaItems([
        null,
        "x",
        { title: { a: 1 }, time: 18 },
        { title: "Cena", time: "20:00", icon: "unknown", location: "Jardín" },
        {},
      ]),
    ).toEqual([
      { time: "18", title: "" },
      { time: "20:00", title: "Cena", location: "Jardín" },
    ]);
  });

  it("renders valid activities", () => {
    const html = render(AgendaSection, {
      title: "Programa",
      items: [{ time: "18:00", title: "Ceremonia", icon: "ceremony" }],
    });
    expect(html).toContain("Programa");
    expect(html).toContain("Ceremonia");
  });
});

describe("text fields with the wrong type (STU-6)", () => {
  it.each([
    ["LegacyText", LegacyText],
    ["LegacyHero", LegacyHero],
    ["GraduationHero", GraduationHero],
    ["LegacyMap", LegacyMap],
    ["CountdownHeader", CountdownHeader],
  ] as const)("%s does not throw on an object title", (_name, component) => {
    expect(() =>
      render(component, {
        title: { a: 1 },
        heading: { a: 1 },
        content: ["x"],
        subtitle: null,
        years: { y: 1 },
        targetDate: null,
        mapUrl: "https://maps.example.com/embed",
      }),
    ).not.toThrow();
  });

  it("LegacyText still renders valid text next to a bad field", () => {
    const html = render(LegacyText, { title: { a: 1 }, content: "Bienvenidos" });
    expect(html).toContain("Bienvenidos");
  });

  it("countdown treats null or non-string dates as zero", () => {
    expect(calculateCountdownTimeLeft(null)).toEqual({
      days: 0,
      hours: 0,
      minutes: 0,
      seconds: 0,
    });
    expect(
      calculateCountdownTimeLeft({ a: 1 } as unknown as string),
    ).toMatchObject({ days: 0 });
  });
});
