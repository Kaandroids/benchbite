import { assertEquals } from '@std/assert';

import { readJpeg } from './photos.ts';
import { EOI, EXIF, FRAME, JFIF, jpeg, SCAN, segment, SOI, TABLES, XMP } from './test-photos.ts';

Deno.test('reads the size of a JPEG', () => {
  assertEquals(readJpeg(jpeg(SOI, JFIF, TABLES, FRAME, SCAN, EOI)), { width: 640, height: 480 });
  // Markers may be padded with 0xFF.
  assertEquals(readJpeg(jpeg(SOI, [0xff], JFIF, FRAME, SCAN, EOI)), { width: 640, height: 480 });
});

Deno.test('refuses a JPEG with Exif or XMP data, wherever it is', () => {
  assertEquals(readJpeg(jpeg(SOI, EXIF, JFIF, FRAME, SCAN, EOI)), 'photo_has_exif');
  assertEquals(readJpeg(jpeg(SOI, JFIF, XMP, FRAME, SCAN, EOI)), 'photo_has_exif');
  // Between the scans of a progressive JPEG.
  assertEquals(readJpeg(jpeg(SOI, JFIF, FRAME, SCAN, EXIF, SCAN, EOI)), 'photo_has_exif');
});

Deno.test('refuses what is not a whole JPEG', () => {
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  for (const bytes of [
    png,
    [],
    SOI,
    // Cut off, in a segment or in the scan.
    [...SOI, ...JFIF.slice(0, 6)],
    [...SOI, ...JFIF, ...FRAME, ...SCAN],
    // No frame before the scan, or none at all.
    [...SOI, ...JFIF, ...SCAN, ...EOI],
    [...SOI, ...JFIF, ...EOI],
    // Anything after the end, as another image with its Exif data.
    [...SOI, ...JFIF, ...FRAME, ...SCAN, ...EOI, ...SOI, ...EXIF, ...EOI],
    // A segment shorter than its length.
    [...SOI, 0xff, 0xe0, 0x00, 0x01, ...FRAME, ...SCAN, ...EOI],
    // A frame of no size.
    [...SOI, ...segment(0xc0, [8, 0, 0, 0x02, 0x80, 1, 1, 0x11, 0]), ...SCAN, ...EOI],
  ]) {
    assertEquals(readJpeg(new Uint8Array(bytes)), 'photo_not_jpeg', `${bytes}`);
  }
});
