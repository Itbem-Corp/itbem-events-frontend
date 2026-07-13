import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("TemplateLayout Open Graph safety", () => {
  it("sanitizes the shared URL at the single layout boundary", () => {
    const source = readFileSync(
      new URL("../../src/layouts/template.astro", import.meta.url),
      "utf8",
    );

    expect(source).toContain(
      'import { sanitizePublicShareUrl } from "../lib/publicShareUrl";',
    );
    expect(source).toContain(
      "const publicOgUrl = ogUrl ? sanitizePublicShareUrl(ogUrl) : '';",
    );
    expect(source).toContain(
      '<meta property="og:url" content={publicOgUrl} />',
    );
    expect(source).not.toContain(
      '<meta property="og:url"            content={ogUrl} />',
    );
  });
});
