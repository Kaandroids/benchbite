import { assertEquals } from '@std/assert';

import { mp4Length } from './voice.ts';

const word = (n: number) => [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const type = (name: string) => [...name].map((c) => c.charCodeAt(0));
const box = (name: string, ...contents: number[][]) => {
  const body = contents.flat();
  return [...word(8 + body.length), ...type(name), ...body];
};
const length = (...boxes: number[][]) => {
  const bytes = new Uint8Array(boxes.flat());
  return mp4Length(new DataView(bytes.buffer));
};

const FTYP = box('ftyp', type('M4A '), word(512));
/** A movie header of version 0: version and flags, created, changed, time scale, duration. */
const MVHD = box('mvhd', word(0), word(0), word(0), word(44100), word(44100 * 4));

Deno.test("reads an MP4 file's length from its movie header", () => {
  assertEquals(length(FTYP, box('moov', MVHD)), 4000);
  // After the audio, as some recorders write it.
  assertEquals(length(FTYP, box('mdat', [1, 2, 3]), box('moov', box('udta'), MVHD)), 4000);
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
  assertEquals(length(FTYP, box('moov', box('mvhd', word(0), word(0)))), undefined);
  assertEquals(
    length(FTYP, box('moov', box('mvhd', word(0), word(0), word(0), word(0), word(10)))),
    undefined,
  );
  // A box that says it is larger than the file.
  assertEquals(length(FTYP, [...word(9999), ...type('moov')]), undefined);
});
