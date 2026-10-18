/**
 * Reads the EXIF Orientation (1-8) of a JPEG. Returns 1 when the file is not a
 * JPEG or carries no readable orientation tag.
 *
 * Browsers disagree on whether createImageBitmap/drawImage honour this tag
 * (notably Safari on iPhone), so the upload optimizer uses it to leave oriented
 * photos untouched for the server, which bakes the rotation into the pixels.
 */
export function parseJpegExifOrientation(bytes: Uint8Array): number {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return 1;
  let offset = 2;
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) return 1;
    const marker = bytes[offset + 1];
    if (marker === 0xda || marker === 0xd9) return 1;
    const length = (bytes[offset + 2] << 8) | bytes[offset + 3];
    if (marker === 0xe1 && length >= 14) {
      const start = offset + 4;
      const isExif =
        bytes[start] === 0x45 &&
        bytes[start + 1] === 0x78 &&
        bytes[start + 2] === 0x69 &&
        bytes[start + 3] === 0x66 &&
        bytes[start + 4] === 0 &&
        bytes[start + 5] === 0;
      if (isExif) return readTiffOrientation(bytes, start + 6, offset + 2 + length);
    }
    offset += 2 + length;
  }
  return 1;
}

function readTiffOrientation(bytes: Uint8Array, tiff: number, end: number): number {
  if (tiff + 8 > bytes.length) return 1;
  const little = bytes[tiff] === 0x49 && bytes[tiff + 1] === 0x49;
  const big = bytes[tiff] === 0x4d && bytes[tiff + 1] === 0x4d;
  if (!little && !big) return 1;
  const u16 = (p: number) =>
    little ? bytes[p] | (bytes[p + 1] << 8) : (bytes[p] << 8) | bytes[p + 1];
  const u32 = (p: number) =>
    little
      ? (bytes[p] | (bytes[p + 1] << 8) | (bytes[p + 2] << 16) | (bytes[p + 3] << 24)) >>> 0
      : ((bytes[p] << 24) | (bytes[p + 1] << 16) | (bytes[p + 2] << 8) | bytes[p + 3]) >>> 0;
  const ifd = tiff + u32(tiff + 4);
  if (ifd + 2 > end || ifd + 2 > bytes.length) return 1;
  const entries = u16(ifd);
  for (let i = 0; i < entries; i++) {
    const entry = ifd + 2 + i * 12;
    if (entry + 12 > end || entry + 12 > bytes.length) return 1;
    if (u16(entry) === 0x0112) {
      const value = u16(entry + 8);
      return value >= 1 && value <= 8 ? value : 1;
    }
  }
  return 1;
}

export async function readJpegOrientation(file: Blob): Promise<number> {
  try {
    // EXIF lives in the first APP1 segment, always near the start of the file.
    const head = new Uint8Array(await file.slice(0, 128 * 1024).arrayBuffer());
    return parseJpegExifOrientation(head);
  } catch {
    return 1;
  }
}
