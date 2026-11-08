import { assert, assertEquals, assertNotEquals } from '@std/assert';

import { codeHash, isCode, newCode } from './deletion_code.ts';

Deno.test('makes codes of random digits', () => {
  const codes = Array.from({ length: 200 }, newCode);
  assert(codes.every(isCode));
  assert(new Set(codes).size > 190);
  // Every digit comes up somewhere in 1200 of them.
  assertEquals(new Set(codes.join('')).size, 10);
});

Deno.test('hashes a code with its user', async () => {
  assertEquals(await codeHash('a', '123456'), await codeHash('a', '123456'));
  assertNotEquals(await codeHash('a', '123456'), await codeHash('b', '123456'));
});

Deno.test('knows a code by its form', () => {
  assert(isCode('012345'));
  for (const value of ['12345', '1234567', '12345a', 123456, undefined]) {
    assert(!isCode(value));
  }
});
