import { assertEquals } from '@std/assert';

import { decodeBase64 } from './base64.ts';

Deno.test('decodes base64 to its bytes', () => {
  assertEquals(decodeBase64(btoa('\xff\xd8\x00')), new Uint8Array([0xff, 0xd8, 0]));
});
