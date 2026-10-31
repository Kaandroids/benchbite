// Removes a photo's metadata on the device before it is sent to Bite (ADR 0065): the app's half of
// coach-chat's readJpeg() (coach-chat/photos.ts), which refuses a photo with any of it left. Kept
// here, beside the function, so that both keep the same segments. This file imports nothing, so
// that the app can bundle it.

/** Markers that stand alone, without a length: TEM and the restart markers. */
const standalone = (marker: number) => marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7);

/**
 * The segments of the JPEG standard that only say how the image is coded: the frames (SOF0 to
 * SOF15, but the reserved JPG), the tables (DHT, DAC, DQT), the restart interval (DRI), the scans
 * (SOS) and their lines (DNL), and the hierarchical ones (DHP, EXP).
 */
const isCoding = (marker: number) =>
  (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc8) || (marker >= 0xda && marker <= 0xdf);

/** The application segments a photo keeps, by the name each starts with, as readJpeg() does. */
const KEPT: Record<number, string> = { 0xe0: 'JFIF\0', 0xe2: 'ICC_PROFILE\0', 0xee: 'Adobe' };

/** Application segments (APPn) and comments (COM): metadata, unless one of the kept ones. */
const isMetadata = (marker: number) => (marker >= 0xe0 && marker <= 0xef) || marker === 0xfe;

const SOS = 0xda;
const EOI = 0xd9;

function startsWith(bytes: Uint8Array, start: number, end: number, name: string): boolean {
  if (start + name.length > end) return false;
  for (let i = 0; i < name.length; i++) {
    if (bytes[start + i] !== name.charCodeAt(i)) return false;
  }
  return true;
}

/**
 * A JPEG with only the segments it needs: those that code the image and the three application
 * segments readJpeg() keeps, JFIF, the colour profile and Adobe's colour transform. Every other
 * application segment and comment is left out, Exif and XMP among them, wherever it is, as is
 * anything after the end of the image. Gives nothing for bytes that are not a JPEG it can read,
 * or that hold a segment the standard does not define, which the function would refuse.
 */
export function withoutMetadata(bytes: Uint8Array): Uint8Array | undefined {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return undefined;
  // The ranges of the bytes kept, in order.
  const kept: [number, number][] = [[0, 2]];
  let i = 2;
  while (i < bytes.length) {
    if (bytes[i] !== 0xff) return undefined;
    // A marker may be padded with any number of 0xFF, which is left out.
    while (bytes[i] === 0xff) i++;
    if (i >= bytes.length) return undefined;
    const start = i - 1;
    const marker = bytes[i++]!;
    if (marker === EOI) {
      kept.push([start, i]);
      return joined(bytes, kept);
    }
    if (standalone(marker)) {
      kept.push([start, i]);
      continue;
    }
    if (i + 2 > bytes.length) return undefined;
    const length = (bytes[i]! << 8) | bytes[i + 1]!;
    if (length < 2 || i + length > bytes.length) return undefined;
    const end = i + length;
    if (isMetadata(marker)) {
      const name = KEPT[marker];
      if (name && startsWith(bytes, i + 2, end, name)) kept.push([start, end]);
    } else if (isCoding(marker)) {
      kept.push([start, end]);
    } else {
      return undefined;
    }
    i = end;
    if (marker === SOS) {
      // The scan's data, to the next marker; 0xFF 0x00 and the restart markers belong to it.
      const data = i;
      while (i + 1 < bytes.length) {
        if (bytes[i] === 0xff && bytes[i + 1] !== 0 && !standalone(bytes[i + 1]!)) break;
        i++;
      }
      if (i + 1 >= bytes.length) return undefined;
      kept.push([data, i]);
    }
  }
  return undefined;
}

function joined(bytes: Uint8Array, ranges: [number, number][]): Uint8Array {
  const result = new Uint8Array(ranges.reduce((sum, [start, end]) => sum + end - start, 0));
  let at = 0;
  for (const [start, end] of ranges) {
    result.set(bytes.subarray(start, end), at);
    at += end - start;
  }
  return result;
}
