import { describe, expect, it } from "vitest";
import { eventsUrlOrigin, normalizeEventsUrl } from "../../src/lib/eventsUrl";

describe("normalizeEventsUrl", () => {
  it("adds a trailing slash when missing", () => {
    expect(normalizeEventsUrl("https://api.example.com")).toBe(
      "https://api.example.com/",
    );
  });

  it("keeps a trailing slash when present", () => {
    expect(normalizeEventsUrl("https://api.example.com/")).toBe(
      "https://api.example.com/",
    );
  });

  it("collapses repeated trailing slashes to one", () => {
    expect(normalizeEventsUrl("https://api.example.com///")).toBe(
      "https://api.example.com/",
    );
  });

  it("uses the local fallback for empty values", () => {
    expect(normalizeEventsUrl(undefined)).toBe("http://localhost:8080/");
    expect(normalizeEventsUrl("")).toBe("http://localhost:8080/");
  });

  it("trims surrounding whitespace", () => {
    expect(normalizeEventsUrl("  http://localhost:8080  ")).toBe(
      "http://localhost:8080/",
    );
  });

  it("normalizes backend URLs that already include the /api route prefix", () => {
    expect(normalizeEventsUrl("https://api.example.com/api")).toBe(
      "https://api.example.com/",
    );
    expect(normalizeEventsUrl("https://api.example.com/API///")).toBe(
      "https://api.example.com/",
    );
  });

  it("does not strip non-route API-like suffixes", () => {
    expect(normalizeEventsUrl("https://api.example.com/custom-api")).toBe(
      "https://api.example.com/custom-api/",
    );
  });
});

describe("eventsUrlOrigin", () => {
  it("uses the normalized fallback origin for empty values", () => {
    expect(eventsUrlOrigin(undefined)).toBe("http://localhost:8080");
    expect(eventsUrlOrigin("")).toBe("http://localhost:8080");
  });

  it("returns only the origin for configured backends with subpaths", () => {
    expect(
      eventsUrlOrigin("https://staging.example.com/eventi-api/api"),
    ).toBe("https://staging.example.com");
  });

  it("returns an empty string for invalid configured URLs", () => {
    expect(eventsUrlOrigin("not a url")).toBe("");
  });
});
