import { describe, expect, test } from "vitest";
import { passwordVerificationSessionKey } from "../../src/lib/accessSessionKeys";

describe("passwordVerificationSessionKey", () => {
  test("scopes verified access by backend, identifier, version, and invitation token", () => {
    const baseKey = passwordVerificationSessionKey(
      "https://api.example.com/",
      "izapa-2025",
      "2026-07-08T00:00:00Z",
      "tok_123",
    );

    expect(baseKey).toMatch(/^event-verified-[a-z0-9]+$/);
    expect(
      passwordVerificationSessionKey(
        "https://api.example.com/api///",
        "izapa-2025",
        "2026-07-08T00:00:00Z",
        "tok_123",
      ),
    ).toBe(baseKey);
    expect(
      passwordVerificationSessionKey(
        "https://api.example.com/",
        "izapa-2025",
        "2026-07-09T00:00:00Z",
        "tok_123",
      ),
    ).not.toBe(baseKey);
    expect(
      passwordVerificationSessionKey(
        "https://api.example.com/",
        "izapa-2025",
        "2026-07-08T00:00:00Z",
        "public",
      ),
    ).not.toBe(baseKey);
    expect(baseKey).not.toContain("tok_123");
    expect(baseKey).not.toContain("izapa-2025");
  });
});
