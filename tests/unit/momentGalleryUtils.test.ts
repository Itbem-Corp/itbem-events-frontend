import { describe, it, expect } from "vitest";

// Mirrors getCardType() from MomentsGallery.tsx.
// Every 10th photo (1-indexed: 10, 20, 30...) becomes a featured (2×2) card.
function getCardType(index: number): "normal" | "featured" {
  return (index + 1) % 10 === 0 ? "featured" : "normal";
}

describe("getCardType", () => {
  it("returns 'normal' for index 0 (first photo)", () => {
    expect(getCardType(0)).toBe("normal");
  });

  it("returns 'featured' for index 9 (10th photo)", () => {
    expect(getCardType(9)).toBe("featured");
  });

  it("returns 'normal' for index 8 (9th photo)", () => {
    expect(getCardType(8)).toBe("normal");
  });

  it("returns 'normal' for index 10 (11th photo)", () => {
    expect(getCardType(10)).toBe("normal");
  });

  it("returns 'featured' for index 19 (20th photo)", () => {
    expect(getCardType(19)).toBe("featured");
  });

  it("returns 'featured' for index 29 (30th photo)", () => {
    expect(getCardType(29)).toBe("featured");
  });

  it("returns 'normal' for index 99 (not a multiple of 10)", () => {
    expect(getCardType(98)).toBe("normal");
  });

  it("returns 'featured' for index 99 (100th photo)", () => {
    expect(getCardType(99)).toBe("featured");
  });
});
