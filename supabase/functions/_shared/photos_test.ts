import { assertEquals } from '@std/assert';

import { decodedBytes, MAX_PHOTO_BYTES, photosBodyBytes, photosFit } from './photos.ts';

Deno.test('counts the bytes base64 holds', () => {
  for (const bytes of [1, 2, 3, 4, 1000]) {
    assertEquals(decodedBytes(btoa('x'.repeat(bytes))), bytes);
  }
});

Deno.test('takes photos within the limits, each and together', () => {
  assertEquals(photosFit([MAX_PHOTO_BYTES, MAX_PHOTO_BYTES]), true);
  assertEquals(photosFit([MAX_PHOTO_BYTES + 1]), false);
  assertEquals(photosFit([1_100_000, 1_100_000, 1_100_000]), false);
});

Deno.test('reads a body that holds the photos at their largest', () => {
  const largest = btoa('x'.repeat(MAX_PHOTO_BYTES));
  assertEquals(photosBodyBytes(0) >= 2 * largest.length, true);
});
