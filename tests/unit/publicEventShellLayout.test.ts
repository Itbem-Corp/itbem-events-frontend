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

// Review F4: the overlay covers the loading and error states underneath, so
// it must go away even when the page never reports it is ready.
describe("public event server shell release", () => {
  const shellSource = read("src/components/public/PublicEventShell.astro");
  const script = shellSource.match(/<script is:inline>([\s\S]*?)<\/script>/)?.[1] ?? "";

  function mountShell() {
    const timers: Array<{ id: number; ms: number; fn: () => void; cleared: boolean }> = [];
    const listeners = new Map<string, () => void>();
    const shell = {
      removed: false,
      attrs: {} as Record<string, string>,
      classes: new Set<string>(),
      setAttribute(name: string, value: string) { this.attrs[name] = value; },
      classList: { add: (name: string) => shell.classes.add(name) },
      remove() { this.removed = true; },
    };
    const window = {
      setTimeout: (fn: () => void, ms: number) => {
        const timer = { id: timers.length + 1, ms, fn, cleared: false };
        timers.push(timer);
        return timer.id;
      },
      clearTimeout: (id: number) => {
        const timer = timers.find((t) => t.id === id);
        if (timer) timer.cleared = true;
      },
      addEventListener: (name: string, fn: () => void) => listeners.set(name, fn),
    };
    const document = { getElementById: (id: string) => (id === "eventi-server-shell" ? shell : null) };
    new Function("window", "document", script)(window, document);
    const runDue = () => {
      for (const timer of [...timers]) {
        if (!timer.cleared) { timer.cleared = true; timer.fn(); }
      }
    };
    return { shell, timers, listeners, runDue };
  }

  it("removes itself after a safety timeout when the page never gets ready", () => {
    const { shell, timers, runDue } = mountShell();
    expect(timers[0]?.ms).toBe(15000);
    expect(shell.removed).toBe(false);
    runDue(); // fallback fires
    expect(shell.classes.has("eventi-server-shell--ready")).toBe(true);
    expect(shell.attrs["aria-hidden"]).toBe("true");
    runDue(); // fade-out removal
    expect(shell.removed).toBe(true);
  });

  it("is released by the ready event and cancels the fallback", () => {
    const { shell, timers, listeners } = mountShell();
    listeners.get("eventi:public-page-ready")?.();
    expect(timers[0]?.cleared).toBe(true);
    expect(shell.classes.has("eventi-server-shell--ready")).toBe(true);
  });

  it("tells guests without JavaScript what to do, in Spanish", () => {
    expect(shellSource).toMatch(/<noscript>[\s\S]*activa JavaScript en tu navegador[\s\S]*<\/noscript>/);
  });
});
