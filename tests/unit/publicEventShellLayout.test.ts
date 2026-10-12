import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) =>
  readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

describe("public event server shell layout (QA PUB-N1)", () => {
  it("is an overlay out of the page flow, so removing it does not move the page", () => {
    const shell = read("src/components/public/PublicEventShell.astro");
    const rule = shell.match(/\.eventi-server-shell \{[^}]*\}/)?.[0] ?? "";
    expect(rule).toMatch(/position:\s*fixed/);
    expect(rule).toMatch(/inset:\s*0/);
    expect(rule).not.toMatch(/min-height:\s*100svh/);
  });

  it("is released on a final load error too, or the overlay would hide it", () => {
    const page = read("src/components/engine/EventPage.tsx");
    const effect = page.slice(
      page.indexOf("eventi:public-page-ready") - 400,
      page.indexOf("eventi:public-page-ready") + 200,
    );
    expect(effect).toContain("(!spec && !error)");
    expect(effect).toContain("[spec, error]");
  });
});
