import { assert, assertEquals, assertNotEquals } from '@std/assert';

import { CODE_LENGTH, codeHash, newCode } from './deletion_code.ts';

Deno.test('makes codes of random digits', () => {
  const codes = Array.from({ length: 200 }, newCode);
  assert(codes.every((code) => new RegExp(`^\\d{${CODE_LENGTH}}$`).test(code)));
  assert(new Set(codes).size > 190);
  // Every digit comes up somewhere in 1200 of them.
  assertEquals(new Set(codes.join('')).size, 10);
});

Deno.test('hashes a code with its user', async () => {
  assertEquals(await codeHash('a', '123456'), await codeHash('a', '123456'));
  assertNotEquals(await codeHash('a', '123456'), await codeHash('b', '123456'));
});
