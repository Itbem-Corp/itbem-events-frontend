import { describe, expect, it } from "vitest";
import {
  buildEventMomentsPath,
  buildSharedUploadPageUrl,
  getSharedUploadIdentifier,
} from "../../src/lib/sharedUploadIdentifier";

describe("getSharedUploadIdentifier", () => {
  it("extracts identifiers from the legacy friendly upload path", () => {
    expect(
      getSharedUploadIdentifier("/events/evento%20especial%2F2026/upload"),
    ).toBe("evento especial/2026");
  });

  it("extracts identifiers from the query-based shared upload URL", () => {
    expect(
      getSharedUploadIdentifier(
        "/events/upload",
        "?e=evento+especial%2F2026",
      ),
    ).toBe("evento especial/2026");
  });

  it("extracts query identifiers from full upload URLs", () => {
    expect(
      getSharedUploadIdentifier(
        "/events/upload",
        "https://www.eventiapp.com.mx/events/upload?e=evento%20especial",
      ),
    ).toBe("evento especial");
  });

  it("keeps the legacy identifier query param as a fallback", () => {
    expect(
      getSharedUploadIdentifier(
        "/events/upload",
        "?identifier=evento%20especial",
      ),
    ).toBe("evento especial");
  });

  it("normalizes encoded query identifiers before using them", () => {
    expect(getSharedUploadIdentifier("/events/upload", "?e=%20mi%2520evento%20")).toBe(
      "mi evento",
    );
  });

  it("builds canonical path-based shared upload URLs for QR codes", () => {
    expect(
      buildSharedUploadPageUrl(
        "https://www.eventiapp.com.mx",
        "evento especial/2026",
      ),
    ).toBe(
      "https://www.eventiapp.com.mx/events/evento%20especial%2F2026/upload",
    );
  });

  it("builds shared upload URLs without double-encoding identifiers", () => {
    expect(
      buildSharedUploadPageUrl("https://www.eventiapp.com.mx", " evento%20especial "),
    ).toBe("https://www.eventiapp.com.mx/events/evento%20especial/upload");
  });

  it("preserves public frontend subpaths when building shared upload URLs", () => {
    expect(
      buildSharedUploadPageUrl(
        "https://preview.example.com/eventi-public/",
        "mi evento",
      ),
    ).toBe("https://preview.example.com/eventi-public/events/mi%20evento/upload");
  });

  it("preserves relative public frontend subpaths when building shared upload URLs", () => {
    expect(buildSharedUploadPageUrl("/eventi-public", "mi evento")).toBe(
      "/eventi-public/events/mi%20evento/upload",
    );
  });

  it("builds root-relative shared upload URLs when no base is provided", () => {
    expect(
      buildSharedUploadPageUrl("", "mi evento", {
        cacheKey: 6,
        previewToken: " token/123 ",
      }),
    ).toBe("/events/mi%20evento/upload?preview=1&t=6&preview_token=token%2F123");
  });

  it("builds shared upload preview URLs with the dashboard preview contract", () => {
    expect(
      buildSharedUploadPageUrl("https://www.eventiapp.com.mx", "mi evento", {
        cacheKey: 6,
        previewToken: " token/123 ",
      }),
    ).toBe(
      "https://www.eventiapp.com.mx/events/mi%20evento/upload?preview=1&t=6&preview_token=token%2F123",
    );
  });

  it("preserves invitation access tokens in shared upload URLs", () => {
    expect(
      buildSharedUploadPageUrl("https://www.eventiapp.com.mx", "mi evento", {
        invitationToken: " invite/123 ",
      }),
    ).toBe(
      "https://www.eventiapp.com.mx/events/mi%20evento/upload?token=invite%2F123",
    );
  });

  it("preserves verified event access tokens in shared upload URLs", () => {
    expect(
      buildSharedUploadPageUrl("https://www.eventiapp.com.mx", "mi evento", {
        accessToken: " proof/123 ",
      }),
    ).toBe(
      "https://www.eventiapp.com.mx/events/mi%20evento/upload?event_access_token=proof%2F123",
    );
  });

  it("does not mark shared upload URLs as preview when only cache busting is provided", () => {
    expect(
      buildSharedUploadPageUrl("https://www.eventiapp.com.mx", "mi evento", {
        cacheKey: "abc",
      }),
    ).toBe("https://www.eventiapp.com.mx/events/mi%20evento/upload");
  });

  it("does not mark shared upload URLs as preview when preview params are blank", () => {
    expect(
      buildSharedUploadPageUrl("https://www.eventiapp.com.mx", "mi evento", {
        cacheKey: " ",
        previewToken: " ",
      }),
    ).toBe("https://www.eventiapp.com.mx/events/mi%20evento/upload");
  });

  it("builds encoded public moments wall paths", () => {
    expect(buildEventMomentsPath("evento especial/2026")).toBe(
      "/e/evento%20especial%2F2026/momentos",
    );
  });

  it("builds moments wall paths with preview and invitation context", () => {
    expect(
      buildEventMomentsPath("evento especial", "", {
        cacheKey: 7,
        previewToken: " preview/123 ",
        invitationToken: " invite/123 ",
      }),
    ).toBe(
      "/e/evento%20especial/momentos?preview=1&t=7&preview_token=preview%2F123&token=invite%2F123",
    );
  });

  it("builds moments wall paths with verified event access context", () => {
    expect(
      buildEventMomentsPath("evento especial", "", {
        accessToken: " proof/123 ",
      }),
    ).toBe(
      "/e/evento%20especial/momentos?event_access_token=proof%2F123",
    );
  });

  it("does not add blank preview params to public moments wall paths", () => {
    expect(
      buildEventMomentsPath("evento especial", "", {
        cacheKey: "",
        previewToken: "",
        invitationToken: "",
      }),
    ).toBe("/e/evento%20especial/momentos");
  });

  it("preserves public frontend subpaths when linking back to the moments wall", () => {
    expect(
      buildEventMomentsPath(
        "evento especial",
        "https://preview.example.com/eventi-public/",
      ),
    ).toBe("https://preview.example.com/eventi-public/e/evento%20especial/momentos");
  });

  it("preserves relative public frontend subpaths when linking back to the moments wall", () => {
    expect(buildEventMomentsPath("evento especial", "/eventi-public")).toBe(
      "/eventi-public/e/evento%20especial/momentos",
    );
  });
});
