import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import AgendaSection from "../../src/components/sections/AgendaSection";

describe("AgendaSection", () => {
  it("renders legacy SCHEDULE content when timeline items are absent", () => {
    const html = renderToStaticMarkup(
      React.createElement(AgendaSection, {
        sectionId: "section-1",
        EVENTS_URL: "https://api.example.com/",
        config: {
          title: "Programa",
          content: "Ceremonia a las 18:00\nRecepcion a las 20:00",
        },
      }),
    );

    expect(html).toContain("Programa");
    expect(html).toContain("Ceremonia a las 18:00");
    expect(html).toContain("Recepcion a las 20:00");
  });
});
