// Removes a photo's metadata on the device before it is sent to Bite (ADR 0065): the app's half of
// coach-chat's readJpeg() (coach-chat/photos.ts), which refuses a photo with any of it left. Both
// read a JPEG with segments() alone, so that they keep the same segments and read them alike. This
// file imports nothing, so that the app can bundle it.

/**
 * A segment of a JPEG, from its marker's 0xFF, padding left out, to its end: after its data for a
 * segment with a length, after the scan's data for a start of scan (SOS). `metadata` is set for an
 * application segment or comment that is not one of the kept ones.
 */
export type Segment = { marker: number; start: number; end: number; metadata: boolean };

/** The start of a scan, whose data follows its segment, and the end of the image. */
export const SOS = 0xda;
export const EOI = 0xd9;

/** A start of frame, which holds the photo's size: SOF0 to SOF15, but DHT, JPG and DAC. */
export const isFrame = (marker: number) =>
  marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;

/** Markers that stand alone, without a length: TEM and the restart markers. */
const standalone = (marker: number) => marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7);

/**
 * The segments of the JPEG standard that only say how the image is coded: the tables (DHT, DAC,
 * DQT), the restart interval (DRI), the scans' lines (DNL), the hierarchical ones (DHP, EXP), and
 * the frames and scans.
 */
const isCoding = (marker: number) =>
  isFrame(marker) || marker === 0xc4 || marker === 0xcc || (marker >= 0xda && marker <= 0xdf);

/**
 * The application segments a photo may keep, by the name each starts with: JFIF (APP0), the
 * colour profile (APP2) and Adobe's colour transform (APP14). Every other application segment
 * (APPn) or comment (COM) is metadata, as Exif and XMP (APP1), Photoshop's IPTC data (APP13) or a
 * comment can hold where and when a photo was taken.
 */
const KEPT: Record<number, string> = {
  0xe0: 'JFIF\0',
  0xe2: 'ICC_PROFILE\0',
  0xee: 'Adobe',
};

/** Application segments (APPn) and comments (COM): metadata, unless one of the kept ones. */
const isMetadata = (marker: number) => (marker >= 0xe0 && marker <= 0xef) || marker === 0xfe;

/** Whether a segment's data, from `start`, begins with a name. */
function startsWith(bytes: Uint8Array, start: number, end: number, name: string): boolean {
  if (start + name.length > end) return false;
  for (let i = 0; i < name.length; i++) {
    if (bytes[start + i] !== name.charCodeAt(i)) return false;
  }
  return true;
}

/**
 * Walks a JPEG's segments after its start of image (SOI), in order, to its end of image (EOI),
 * the last one given; anything after it is not read. Gives `undefined`, and stops, where the bytes
 * are not a JPEG it can read: no start of image, a marker or length missing or running past the
 * end, or a segment the standard does not define. Each segment is checked as it is reached, so a
 * reader may stop at one before a later one is found wrong.
 */
export function* segments(bytes: Uint8Array): Generator<Segment | undefined, void, void> {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return void (yield);
  let i = 2;
  while (i < bytes.length) {
    if (bytes[i] !== 0xff) return void (yield);
    // A marker may be padded with any number of 0xFF, which is left out.
    while (bytes[i] === 0xff) i++;
    if (i >= bytes.length) return void (yield);
    const start = i - 1;
    const marker = bytes[i++]!;
    if (marker === EOI || standalone(marker)) {
      yield { marker, start, end: i, metadata: false };
      if (marker === EOI) return;
      continue;
    }
    if (i + 2 > bytes.length) return void (yield);
    const length = (bytes[i]! << 8) | bytes[i + 1]!;
    if (length < 2 || i + length > bytes.length) return void (yield);
    let end = i + length;
    let metadata = false;
    if (isMetadata(marker)) {
      const name = KEPT[marker];
      metadata = !name || !startsWith(bytes, i + 2, end, name);
    } else if (!isCoding(marker)) {
      return void (yield);
    }
    if (marker === SOS) {
      // The scan's data, to the next marker; 0xFF 0x00 and the restart markers belong to it.
      while (end + 1 < bytes.length) {
        if (bytes[end] === 0xff && bytes[end + 1] !== 0 && !standalone(bytes[end + 1]!)) break;
        end++;
      }
      if (end + 1 >= bytes.length) return void (yield);
    }
    yield { marker, start, end, metadata };
    i = end;
  }
  yield undefined;
}

/**
 * A JPEG with only the segments it needs: those that code the image and the three application
 * segments readJpeg() keeps, JFIF, the colour profile and Adobe's colour transform. Every other
 * application segment and comment is left out, Exif and XMP among them, wherever it is, as is
 * anything after the end of the image. Gives nothing for bytes that are not a JPEG it can read,
 * or that hold a segment the standard does not define, which the function would refuse.
 */
export function withoutMetadata(bytes: Uint8Array): Uint8Array | undefined {
  // The ranges of the bytes kept, in order, from the start of image.
  const kept: [number, number][] = [[0, 2]];
  for (const segment of segments(bytes)) {
    if (!segment) return undefined;
    if (!segment.metadata) kept.push([segment.start, segment.end]);
  }
  return joined(bytes, kept);
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
