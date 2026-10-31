import { assertEquals } from '@std/assert';

import { readJpeg } from '../coach-chat/photos.ts';
import {
  ADOBE,
  EOI,
  EXIF,
  FRAME,
  ICC,
  JFIF,
  jpeg,
  PROGRESSIVE,
  QUANTISATION,
  RESTARTS,
  SCAN,
  segment,
  SOI,
  TABLES,
  XMP,
} from '../coach-chat/test-photos.ts';
import { withoutMetadata } from './jpeg_metadata.ts';

const text = (value: string) => [...new TextEncoder().encode(value)];
const IPTC = segment(0xed, text('Photoshop 3.0\0'));
const COMMENT = segment(0xfe, text('Taken at home'));
/** A JFIF extension, with a thumbnail, which a photo may not keep. */
const JFXX = segment(0xe0, text('JFXX\0'));

Deno.test('keeps a JPEG without metadata as it is', () => {
  const plain = jpeg(SOI, JFIF, ICC, ADOBE, QUANTISATION, FRAME, TABLES, RESTARTS, SCAN, EOI);
  assertEquals(withoutMetadata(plain), plain);
});

Deno.test('leaves out every metadata segment, so that coach-chat takes the photo', () => {
  const photo = jpeg(SOI, JFIF, EXIF, XMP, ICC, IPTC, COMMENT, JFXX, FRAME, TABLES, SCAN, EOI);
  const stripped = withoutMetadata(photo)!;
  assertEquals(readJpeg(photo), 'photo_has_exif');
  assertEquals(stripped, jpeg(SOI, JFIF, ICC, FRAME, TABLES, SCAN, EOI));
  assertEquals(readJpeg(stripped), { width: 640, height: 480 });
});

Deno.test('leaves out metadata between the scans of a progressive JPEG', () => {
  const photo = jpeg(SOI, JFIF, PROGRESSIVE, TABLES, SCAN, EXIF, COMMENT, TABLES, SCAN, EOI);
  const stripped = withoutMetadata(photo)!;
  assertEquals(stripped, jpeg(SOI, JFIF, PROGRESSIVE, TABLES, SCAN, TABLES, SCAN, EOI));
  assertEquals(readJpeg(stripped), { width: 640, height: 480 });
});

Deno.test('leaves out padding and anything after the end', () => {
  const photo = jpeg(SOI, [0xff, 0xff], EXIF, JFIF, FRAME, SCAN, EOI, EXIF, [1, 2, 3]);
  const stripped = withoutMetadata(photo)!;
  assertEquals(stripped, jpeg(SOI, JFIF, FRAME, SCAN, EOI));
  assertEquals(readJpeg(stripped), { width: 640, height: 480 });
});

Deno.test('gives nothing for what is not a JPEG it can read', () => {
  assertEquals(withoutMetadata(new Uint8Array([0x89, 0x50, 0x4e, 0x47])), undefined);
  // Cut short, without its end, or with a segment longer than the bytes.
  assertEquals(withoutMetadata(jpeg(SOI, JFIF, FRAME, SCAN)), undefined);
  assertEquals(withoutMetadata(jpeg(SOI, [0xff, 0xe1, 0x40, 0x00, 1])), undefined);
  // A segment the standard does not define (JPG0).
  assertEquals(withoutMetadata(jpeg(SOI, segment(0xf0), FRAME, SCAN, EOI)), undefined);
});
