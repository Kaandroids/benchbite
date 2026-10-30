// JPEGs for tests, built from their segments, as readJpeg() reads no further.

/** A segment: its marker, then its length, which counts itself, and its data. */
export function segment(marker: number, data: number[] = []): number[] {
  const length = data.length + 2;
  return [0xff, marker, length >> 8, length & 0xff, ...data];
}

export const SOI = [0xff, 0xd8];
export const EOI = [0xff, 0xd9];
export const JFIF = segment(0xe0, [
  ...new TextEncoder().encode('JFIF\0'),
  ...[1, 1, 0, 0, 1, 0, 1, 0, 0],
]);
/** A frame of 640 by 480 (SOF0): precision, height, width, one component. */
export const FRAME = segment(0xc0, [8, 0x01, 0xe0, 0x02, 0x80, 1, 1, 0x11, 0]);
export const TABLES = segment(0xc4, [0, ...new Array(16).fill(0)]);
/** A scan's header, then its data, with a stuffed 0xFF 0x00 and a restart marker in it. */
export const SCAN = [
  ...segment(0xda, [1, 1, 0, 0, 0x3f, 0]),
  ...[0x12, 0xff, 0x00, 0x34, 0xff, 0xd0, 0x56],
];
export const EXIF = segment(0xe1, [...new TextEncoder().encode('Exif\0\0'), 0x4d, 0x4d, 0, 0x2a]);
export const XMP = segment(0xe1, [...new TextEncoder().encode('http://ns.adobe.com/xap/1.0/\0')]);

export const jpeg = (...parts: number[][]) => new Uint8Array(parts.flat());

/** A JPEG of 640 by 480 without Exif data. */
export const PLAIN_JPEG = jpeg(SOI, JFIF, TABLES, FRAME, SCAN, EOI);

/** Bytes as base64, as the app sends them. */
export function base64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}
