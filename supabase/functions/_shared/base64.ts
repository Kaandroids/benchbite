// Base64 data in a request, as the app sends photos, and its bytes. It imports zod, so it stays
// apart from `photos.ts`, which the app bundles.
import { z } from 'zod';

/** Base64 without line breaks, padded to a multiple of 4 characters. */
export const Base64Data = z
  .string()
  .regex(/^[A-Za-z0-9+/]+={0,2}$/)
  .refine((data) => data.length % 4 === 0, 'Not base64');

/** The bytes of base64 data, which the request was checked to hold. */
export function decodeBase64(data: string): Uint8Array {
  const text = atob(data);
  const bytes = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) bytes[i] = text.charCodeAt(i);
  return bytes;
}
