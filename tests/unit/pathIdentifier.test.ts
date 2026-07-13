import { describe, expect, it } from "vitest";
import {
  decodePathIdentifier,
  extractPathIdentifier,
  normalizePathIdentifier,
  normalizePathSegment,
} from "../../src/lib/pathIdentifier";

describe("pathIdentifier", () => {
  it("decodes encoded route identifiers before API URL builders re-encode them", () => {
    expect(decodePathIdentifier("evento%20especial%2F2026")).toBe(
      "evento especial/2026",
    );
  });

  it("normalizes route identifiers at public URL boundaries", () => {
    expect(normalizePathIdentifier(" evento%20especial ")).toBe(
      "evento especial",
    );
  });

  it("normalizes any encoded path segment before URL builders encode it once", () => {
    expect(normalizePathSegment(" section%2F1 ")).toBe("section/1");
  });

  it("extracts encoded identifiers from public event paths", () => {
    expect(
      extractPathIdentifier(
        "/events/evento%20especial%2F2026/upload",
        /\/events\/([^/]+)\/upload/,
      ),
    ).toBe("evento especial/2026");

    expect(
      extractPathIdentifier(
        "/e/mi%20evento/momentos",
        /\/e\/([^/]+)\/momentos/,
      ),
    ).toBe("mi evento");
  });

  it("keeps malformed encoded identifiers instead of throwing", () => {
    expect(decodePathIdentifier("evento%ZZ")).toBe("evento%ZZ");
  });
});
