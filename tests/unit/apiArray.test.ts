import { describe, expect, it } from "vitest";
import { readArrayPayload } from "../../src/lib/apiArray";

describe("apiArray", () => {
  it("returns direct arrays", () => {
    const payload = [{ id: "one" }];

    expect(readArrayPayload(payload)).toEqual(payload);
  });

  it("returns arrays from legacy data wrappers", () => {
    expect(readArrayPayload({ data: [{ id: "one" }] })).toEqual([
      { id: "one" },
    ]);
  });

  it("returns arrays from enveloped paginated backend payloads", () => {
    expect(
      readArrayPayload({
        status: 200,
        message: "ok",
        data: { data: [{ id: "one" }], total: 1 },
      }),
    ).toEqual([{ id: "one" }]);
  });

  it("returns arrays from item-based paginated payloads", () => {
    expect(readArrayPayload({ items: [{ id: "one" }], total: 1 })).toEqual([
      { id: "one" },
    ]);
    expect(
      readArrayPayload({
        status: 200,
        message: "ok",
        data: { items: [{ id: "two" }], total: 1 },
      }),
    ).toEqual([{ id: "two" }]);
  });

  it("returns an empty array for non-array payloads", () => {
    expect(readArrayPayload({ data: { id: "one" } })).toEqual([]);
    expect(readArrayPayload(null)).toEqual([]);
  });
});
