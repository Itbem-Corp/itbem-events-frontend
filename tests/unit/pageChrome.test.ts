import { describe, expect, it } from "vitest";
import { shouldRenderFooter } from "../../src/lib/pageChrome";

describe("shouldRenderFooter", () => {
  it("renders footer by default for legacy page specs", () => {
    expect(shouldRenderFooter(undefined)).toBe(true);
    expect(shouldRenderFooter({})).toBe(true);
  });

  it("hides footer only when the backend explicitly disables it", () => {
    expect(shouldRenderFooter({ footerVisible: false })).toBe(false);
  });

  it("renders footer when explicitly enabled", () => {
    expect(shouldRenderFooter({ footerVisible: true })).toBe(true);
  });
});
