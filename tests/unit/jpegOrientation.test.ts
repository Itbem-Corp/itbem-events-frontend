import { describe, expect, it } from "vitest";
import { parseJpegExifOrientation } from "../../src/lib/jpegOrientation";

function jpegWithOrientation(value: number, littleEndian: boolean): Uint8Array {
  const tiff = littleEndian
    ? [0x49, 0x49, 0x2a, 0, 8, 0, 0, 0, 1, 0, 0x12, 0x01, 3, 0, 1, 0, 0, 0, value, 0, 0, 0, 0, 0, 0, 0]
    : [0x4d, 0x4d, 0, 0x2a, 0, 0, 0, 8, 0, 1, 0x01, 0x12, 0, 3, 0, 0, 0, 1, 0, value, 0, 0, 0, 0, 0, 0];
  const body = [0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff];
  const length = body.length + 2;
  return new Uint8Array([0xff, 0xd8, 0xff, 0xe1, length >> 8, length & 0xff, ...body, 0xff, 0xd9]);
}

describe("parseJpegExifOrientation", () => {
  it.each([1, 3, 6, 8])("reads orientation %i in both byte orders", (value) => {
    expect(parseJpegExifOrientation(jpegWithOrientation(value, false))).toBe(value);
    expect(parseJpegExifOrientation(jpegWithOrientation(value, true))).toBe(value);
  });

  it("returns 1 for JPEGs without EXIF and for non-JPEG data", () => {
    expect(parseJpegExifOrientation(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]))).toBe(1);
    expect(parseJpegExifOrientation(new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0]))).toBe(1);
    expect(parseJpegExifOrientation(new Uint8Array([]))).toBe(1);
  });

  it("ignores out-of-range values and truncated segments", () => {
    expect(parseJpegExifOrientation(jpegWithOrientation(9, false))).toBe(1);
    expect(parseJpegExifOrientation(jpegWithOrientation(6, false).slice(0, 20))).toBe(1);
  });
});
