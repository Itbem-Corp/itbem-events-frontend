import { describe, expect, it } from "vitest";
import {
  buildIdentifierPageSpecUrl,
  buildTokenPageSpecUrl,
} from "../../src/lib/pageSpecUrl";

describe("pageSpecUrl", () => {
  it("builds the public identifier page-spec URL", () => {
    expect(
      buildIdentifierPageSpecUrl("https://api.example.com", "mi evento"),
    ).toBe("https://api.example.com/api/events/mi%20evento/page-spec");
  });

  it("adds preview_token only when present", () => {
    expect(
      buildIdentifierPageSpecUrl(
        "https://api.example.com/",
        "mi-evento",
        " preview-token ",
      ),
    ).toBe(
      "https://api.example.com/api/events/mi-evento/page-spec?preview_token=preview-token",
    );
  });

  it("adds the dashboard preview cache key when present", () => {
    expect(
      buildIdentifierPageSpecUrl(
        "https://api.example.com/",
        "mi-evento",
        " preview-token ",
        " 42 ",
        " invite/123 ",
      ),
    ).toBe(
      "https://api.example.com/api/events/mi-evento/page-spec?preview_token=preview-token&t=42&token=invite%2F123",
    );
  });

  it("does not send the dashboard preview cache key without a signed preview token", () => {
    expect(
      buildIdentifierPageSpecUrl(
        "https://api.example.com/",
        "mi-evento",
        "",
        " 42 ",
        " invite/123 ",
      ),
    ).toBe(
      "https://api.example.com/api/events/mi-evento/page-spec?token=invite%2F123",
    );
  });

  it("sends a public content-version cache key when explicitly allowed", () => {
    expect(
      buildIdentifierPageSpecUrl(
        "https://api.example.com/",
        "mi-evento",
        "",
        " 2026-07-09T12:00:00.000Z ",
        " invite/123 ",
        true,
      ),
    ).toBe(
      "https://api.example.com/api/events/mi-evento/page-spec?t=2026-07-09T12%3A00%3A00.000Z&token=invite%2F123",
    );
  });

  it("builds the invitation token page-spec URL", () => {
    expect(buildTokenPageSpecUrl("https://api.example.com", " ABC 123 ")).toBe(
      "https://api.example.com/api/events/page-spec?token=ABC+123",
    );
  });
});
