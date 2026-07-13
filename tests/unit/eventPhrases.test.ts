import { describe, expect, it } from "vitest";

import { normalizeEventPhraseType } from "../../src/lib/eventPhrases";

describe("eventPhrases", () => {
  it("normalizes event types before requesting backend phrases", () => {
    expect(normalizeEventPhraseType(" Graduation ")).toBe("graduation");
    expect(normalizeEventPhraseType("BODA")).toBe("boda");
    expect(normalizeEventPhraseType(" Graduación ")).toBe("graduacion");
    expect(normalizeEventPhraseType("Niñez")).toBe("ninez");
  });
});
