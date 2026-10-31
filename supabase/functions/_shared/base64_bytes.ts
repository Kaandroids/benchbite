// Bytes as base64 and back, as photos are sent to a function. The app and the functions share
// this pair; the request schema that checks base64 data is in `base64.ts`, which imports zod. This
// file imports nothing, so that the app can bundle it.

/** The bytes of base64 data. */
export function fromBase64(data: string): Uint8Array {
  const text = atob(data);
  const bytes = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) bytes[i] = text.charCodeAt(i);
  return bytes;
}

/** Bytes as base64, a part at a time, as one call cannot take a photo's bytes at once. */
export function toBase64(bytes: Uint8Array): string {
  const PART = 0x8000;
  let text = '';
  for (let i = 0; i < bytes.length; i += PART) {
    text += String.fromCharCode(...bytes.subarray(i, i + PART));
  }
  return btoa(text);
}
