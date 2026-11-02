// MP4 files for tests, built from their boxes, as checkVoice() reads no further.

/** A 32-bit number, as MP4 writes it. */
export const word = (n: number) => [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];

/** A box: its length, which counts itself, its type, and its contents. */
export function box(type: string, ...contents: number[][]): number[] {
  const body = contents.flat();
  return [...word(8 + body.length), ...[...type].map((c) => c.charCodeAt(0)), ...body];
}

/** The file type box an M4A file starts with. */
export const FTYP = box('ftyp', [0x4d, 0x34, 0x41, 0x20], word(512));

/** A movie header of version 0: version and flags, created, changed, time scale, duration. */
export const mvhd = (ms: number, scale = 1000) =>
  box('mvhd', word(0), word(0), word(0), word(scale), word((ms * scale) / 1000));

/** An M4A file `ms` long, by its header, with `audio` bytes of audio. */
export function m4a(ms: number, audio = 0): Uint8Array {
  const mdat = audio ? box('mdat', new Array(audio).fill(0)) : [];
  return new Uint8Array([...FTYP, ...box('moov', mvhd(ms)), ...mdat]);
}
