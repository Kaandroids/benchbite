import { assertEquals } from '@std/assert';

import { box, FTYP, mvhd, word } from './test-voice.ts';
import { mp4Length } from './voice.ts';

const length = (...boxes: number[][]) => {
  const bytes = new Uint8Array(boxes.flat());
  return mp4Length(new DataView(bytes.buffer));
};

Deno.test("reads an MP4 file's length from its movie header", () => {
  assertEquals(length(FTYP, box('moov', mvhd(4000, 44100))), 4000);
  // After the audio, as some recorders write it.
  const late = [FTYP, box('mdat', [1, 2, 3]), box('moov', box('udta'), mvhd(4000))];
  assertEquals(length(...late), 4000);
  // Version 1, with 8-byte times and duration.
  const wide = box(
    'mvhd',
    word(0x01000000),
    word(0),
    word(0),
    word(0),
    word(0),
    word(1000),
    word(0),
    word(61_500),
  );
  assertEquals(length(FTYP, box('moov', wide)), 61_500);
});

Deno.test('gives no length for a file without a whole movie header', () => {
  assertEquals(length(FTYP), undefined);
  assertEquals(length(FTYP, box('moov')), undefined);
  // A header with nothing in it, at the end of the file.
  assertEquals(length(FTYP, box('moov', box('mvhd'))), undefined);
  assertEquals(length(FTYP, box('moov', box('mvhd', word(0), word(0)))), undefined);
  assertEquals(
    length(FTYP, box('moov', box('mvhd', word(0), word(0), word(0), word(0), word(10)))),
    undefined,
  );
  // A box that says it is larger than the file.
  assertEquals(
    length(FTYP, [...word(9999), ...[...'moov'].map((c) => c.charCodeAt(0))]),
    undefined,
  );
});
