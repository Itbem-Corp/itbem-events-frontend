import { afterEach, describe, expect, it, vi } from "vitest";

import { readPublicAccessParams } from "../../src/lib/publicPreview";

function browserAt(href: string) {
  const url = new URL(href);
  const values = new Map<string, string>();
  const replaceState = vi.fn();
  vi.stubGlobal("window", {
    location: {
      href: url.href,
      pathname: url.pathname,
      search: url.search,
    },
    history: { state: null, replaceState },
    sessionStorage: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    },
  });
  return { replaceState, values };
}

afterEach(() => vi.unstubAllGlobals());

describe("public access URL sanitization", () => {
  it("removes credentials from browser history and retains them per session", () => {
    const browser = browserAt(
      "https://www.eventiapp.com.mx/e/demo?theme=dark&token=invite-123&preview_token=preview-456#moments",
    );

    const first = readPublicAccessParams(window.location.search);

    expect(first.invitationToken).toBe("invite-123");
    expect(first.previewToken).toBe("preview-456");
    expect(browser.replaceState).toHaveBeenCalledWith(
      null,
      "",
      "/e/demo?theme=dark#moments",
    );
    expect([...browser.values.keys()]).toEqual([
      "eventiapp:public-access:/e/demo",
    ]);

    window.location.search = "?theme=dark";
    const restored = readPublicAccessParams(window.location.search);
    expect(restored.invitationToken).toBe("invite-123");
    expect(restored.previewToken).toBe("preview-456");
  });
});
