import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import AgendaSection from "../../src/components/sections/AgendaSection";

// STU-9: long unbroken text (emails, URLs, compound names) was clipped at
// 375px because `main` hides horizontal overflow and nothing wrapped.
describe("section text wrapping", () => {
  it("the event page container lets every section wrap long words", () => {
    const source = readFileSync(
      fileURLToPath(new URL("../../src/components/engine/EventPage.tsx", import.meta.url)),
      "utf8",
    );
    const mainTag = source.match(/<main className="eventi-event-page[^"]*"/)?.[0] ?? "";
    expect(mainTag).toContain("[overflow-wrap:anywhere]");
    expect(mainTag).toContain("break-words");
  });

  it("agenda rows let the text column shrink and wrap", () => {
    const html = renderToStaticMarkup(
      React.createElement(AgendaSection, {
        sectionId: "s1",
        EVENTS_URL: "https://api.example.com/",
        config: {
          items: [
            {
              time: "18:00",
              title: "Ceremonia-en-el-jardin-principal-del-salon-de-eventos",
            },
          ],
        },
      }),
    );
    expect(html).toContain("flex-1 min-w-0");
    expect(html).toContain("[overflow-wrap:anywhere]");
  });
});

// STU-13 / STU-15: line breaks typed in Studio were collapsed on the public
// page. React renders a newline as text, so pre-line keeps it without any HTML.
describe("section free text keeps its line breaks", () => {
  const source = (name: string) =>
    readFileSync(
      fileURLToPath(new URL(`../../src/components/sections/${name}.tsx`, import.meta.url)),
      "utf8",
    );
  const paragraphFor = (code: string, expr: string) => {
    const at = code.indexOf(expr);
    expect(at).toBeGreaterThan(-1);
    return code.slice(code.lastIndexOf("<p", at), at);
  };

  it.each([
    ["EventVenue", "{text}"],
    ["EventVenue", "{venueText}"],
    ["Reception", "{venueText}"],
    ["GraduatesList", "{closing}"],
  ])("%s %s", (name, expr) => {
    expect(paragraphFor(source(name), expr)).toContain("whitespace-pre-line");
  });
});
