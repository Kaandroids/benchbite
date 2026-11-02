// The length of an MP4 file, as voice messages are recorded (ADR 0072), read from its own boxes:
// shared, so that the app and coach-chat read the same length. This file imports nothing, so that
// the app can bundle it.

/** An MP4 box: its type, and where its contents start and end. */
export type Box = { type: string; start: number; end: number };

/** The box at `at`, within `end`, or nothing for one that does not fit. */
export function box(view: DataView, at: number, end: number): Box | undefined {
  if (at + 8 > end) return undefined;
  let size = view.getUint32(at);
  let header = 8;
  if (size === 1) {
    // A 64-bit size follows the type.
    if (at + 16 > end) return undefined;
    size = Number(view.getBigUint64(at + 8));
    header = 16;
  } else if (size === 0) {
    // The box goes on to the end.
    size = end - at;
  }
  if (size < header || at + size > end) return undefined;
  const type = String.fromCharCode(...new Uint8Array(view.buffer, view.byteOffset + at + 4, 4));
  return { type, start: at + header, end: at + size };
}

/** The first box of a type among those from `at` to `end`. */
function find(view: DataView, at: number, end: number, type: string): Box | undefined {
  for (let found = box(view, at, end); found; found = box(view, found.end, end)) {
    if (found.type === type) return found;
  }
  return undefined;
}

/**
 * An MP4 file's length in milliseconds, from its movie header (`moov` › `mvhd`), wherever in the
 * file the movie is; nothing for a file without one.
 */
export function mp4Length(view: DataView): number | undefined {
  const moov = find(view, 0, view.byteLength, 'moov');
  const mvhd = moov && find(view, moov.start, moov.end, 'mvhd');
  if (!mvhd) return undefined;
  // After its version and flags, and its times of creation and change: 4 bytes each, or 8 in
  // version 1. Then its time scale, and its duration in it.
  if (mvhd.start >= mvhd.end) return undefined;
  const wide = view.getUint8(mvhd.start) === 1;
  const at = mvhd.start + (wide ? 20 : 12);
  if (at + (wide ? 12 : 8) > mvhd.end) return undefined;
  const scale = view.getUint32(at);
  const duration = wide ? Number(view.getBigUint64(at + 4)) : view.getUint32(at + 4);
  return scale ? Math.round((duration / scale) * 1000) : undefined;
}
