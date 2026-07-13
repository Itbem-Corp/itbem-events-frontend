import { describe, expect, it } from "vitest";
import {
  getApiErrorMessage,
  readApiErrorMessage,
} from "../../src/lib/apiError";

describe("apiError", () => {
  it("prefers detail from API error payloads", () => {
    expect(
      getApiErrorMessage(
        {
          detail: "Token inválido",
          error: "Unauthorized",
          message: "Error",
        },
        "Fallback",
      ),
    ).toBe("Token inválido");
  });

  it("uses backend error before message", () => {
    expect(
      getApiErrorMessage(
        { error: "Las subidas están desactivadas", message: "Error" },
        "Fallback",
      ),
    ).toBe("Las subidas están desactivadas");
  });

  it("uses backend message when no detailed error exists", () => {
    expect(getApiErrorMessage({ message: "Solicitud inválida" }, "Fallback")).toBe(
      "Solicitud inválida",
    );
  });

  it("prefers backend APIResponse message when it is specific", () => {
    expect(
      getApiErrorMessage(
        {
          status: 401,
          message: "Invalid or expired token",
          error: "record not found",
        },
        "Fallback",
      ),
    ).toBe("Invalid or expired token");
  });

  it("reads Pascal-cased backend APIResponse error messages", () => {
    expect(
      getApiErrorMessage(
        {
          Status: 403,
          Message: "Uploads disabled",
          Error: "forbidden",
        },
        "Fallback",
      ),
    ).toBe("Uploads disabled");
  });

  it("falls back to later error aliases when canonical fields are null", () => {
    expect(
      getApiErrorMessage(
        {
          status: null,
          Status: 403,
          message: null,
          Message: "Uploads disabled",
          error: null,
          Error: "forbidden",
        },
        "Fallback",
      ),
    ).toBe("Uploads disabled");
  });

  it("falls back to later error aliases when canonical fields are blank", () => {
    expect(
      getApiErrorMessage(
        {
          status: "",
          Status: 403,
          message: " ",
          Message: "Uploads disabled",
          error: "",
          Error: "forbidden",
        },
        "Fallback",
      ),
    ).toBe("Uploads disabled");
  });

  it("prefers Pascal-cased details when present", () => {
    expect(
      getApiErrorMessage(
        {
          Status: 400,
          Message: "Invalid data",
          Detail: "Token invalido",
        },
        "Fallback",
      ),
    ).toBe("Token invalido");
  });

  it("uses backend APIResponse error when message is generic", () => {
    expect(
      getApiErrorMessage(
        {
          status: 400,
          message: "Invalid data",
          error: "email already exists",
        },
        "Fallback",
      ),
    ).toBe("email already exists");
  });

  it("uses backend details for generic controller messages", () => {
    expect(
      getApiErrorMessage(
        {
          status: 400,
          message: "Invalid event config field",
          error: "unknown event config field: hero_color",
        },
        "Fallback",
      ),
    ).toBe("unknown event config field: hero_color");
  });

  it("uses backend details for generic RSVP validation messages", () => {
    expect(
      getApiErrorMessage(
        {
          status: 400,
          message: "Invalid RSVP request",
          error: "guest count (5) exceeds allowed max (3)",
        },
        "Fallback",
      ),
    ).toBe("guest count (5) exceeds allowed max (3)");
  });

  it("uses backend details for generic logo validation messages", () => {
    expect(
      getApiErrorMessage(
        {
          status: 400,
          message: "Invalid logo",
          error: "unsupported image type: video/mp4",
        },
        "Fallback",
      ),
    ).toBe("unsupported image type: video/mp4");
  });

  it("uses backend details for generic image processing messages", () => {
    expect(
      getApiErrorMessage(
        {
          status: 400,
          message: "Error processing image",
          error: "avatar processing failed: unsupported image type: audio/mpeg",
        },
        "Fallback",
      ),
    ).toBe("avatar processing failed: unsupported image type: audio/mpeg");
  });

  it("uses backend details for generic public access and upload messages", () => {
    const cases = [
      {
        message: "Invalid cursor",
        error: "cursor is missing required fields",
        expected: "cursor is missing required fields",
      },
      {
        message: "Invalid invitation token",
        error: "token does not belong to this event",
        expected: "token does not belong to this event",
      },
      {
        message: "Invalid preview token",
        error: "invalid preview token",
        expected: "invalid preview token",
      },
      {
        message: "Invalid upload key",
        error: "object key does not belong to this event",
        expected: "object key does not belong to this event",
      },
      {
        message: "Invalid file",
        error: "unsupported file type for moments: image/svg+xml",
        expected: "unsupported file type for moments: image/svg+xml",
      },
      {
        message: "Error uploading file",
        error: "file size exceeds 25 MB",
        expected: "file size exceeds 25 MB",
      },
      {
        message: "Error preparing multipart upload",
        error: "unsupported file type for moments: video/x-flv",
        expected: "unsupported file type for moments: video/x-flv",
      },
    ];

    for (const item of cases) {
      expect(getApiErrorMessage({ status: 400, ...item }, "Fallback")).toBe(
        item.expected,
      );
    }
  });

  it("uses backend details for generic RSVP confirmation failures", () => {
    expect(
      getApiErrorMessage(
        {
          status: 401,
          message: "RSVP confirmation failed",
          error: "invalid or expired token",
        },
        "Fallback",
      ),
    ).toBe("invalid or expired token");
  });

  it("does not apply APIResponse message precedence to non-HTTP domain status fields", () => {
    expect(
      getApiErrorMessage(
        {
          status: 1,
          message: "queued",
          error: "domain detail",
        },
        "Fallback",
      ),
    ).toBe("domain detail");
  });

  it("reads payload details from ApiFetchError-like errors", () => {
    expect(
      getApiErrorMessage(
        {
          name: "ApiFetchError",
          status: 400,
          message: "Invalid data",
          payload: {
            status: 400,
            message: "Invalid data",
            error: "El correo ya existe",
          },
        },
        "Fallback",
      ),
    ).toBe("El correo ya existe");
  });

  it("reads backend payloads from Axios-like errors", () => {
    expect(
      getApiErrorMessage(
        {
          response: {
            data: {
              status: 403,
              message: "Uploads disabled",
              error: "forbidden",
            },
          },
        },
        "Fallback",
      ),
    ).toBe("Uploads disabled");
  });

  it("uses Error.message when no API payload exists", () => {
    expect(getApiErrorMessage(new Error("network failed"), "Fallback")).toBe(
      "network failed",
    );
  });

  it("falls back when the payload is empty or non-string", () => {
    expect(getApiErrorMessage(null, "Fallback")).toBe("Fallback");
    expect(getApiErrorMessage({ error: "" }, "Fallback")).toBe("Fallback");
    expect(getApiErrorMessage({ status: 429 }, "Fallback")).toBe("Fallback");
    expect(getApiErrorMessage({ error: { code: "bad_request" } }, "Fallback")).toBe(
      "Fallback",
    );
  });

  it("reads the error payload from a fetch response", async () => {
    const response = new Response(
      JSON.stringify({ error: "Archivo demasiado grande" }),
      {
        status: 413,
        headers: { "Content-Type": "application/json" },
      },
    );

    await expect(readApiErrorMessage(response, "Fallback")).resolves.toBe(
      "Archivo demasiado grande",
    );
  });
});
