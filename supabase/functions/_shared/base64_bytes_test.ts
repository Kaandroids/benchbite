import { assertEquals } from '@std/assert';

import { fromBase64, toBase64 } from './base64_bytes.ts';

Deno.test('decodes base64 to its bytes', () => {
  assertEquals(fromBase64(btoa('\xff\xd8\x00')), new Uint8Array([0xff, 0xd8, 0]));
});

Deno.test('reads base64 back as it was written, for a photo larger than one call takes', () => {
  const bytes = new Uint8Array(100_000).map((_, index) => index % 256);
  assertEquals(fromBase64(toBase64(bytes)), bytes);
});
