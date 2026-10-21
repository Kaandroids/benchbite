import { assertEquals, assertThrows } from '@std/assert';

import { splitFor } from './split.ts';

Deno.test('one and two days train the whole body', () => {
  assertEquals(splitFor(1, 'advanced'), ['full_body']);
  assertEquals(splitFor(2, 'advanced'), ['full_body', 'full_body']);
});

Deno.test('three days are full body for beginners and push, pull, legs otherwise', () => {
  assertEquals(splitFor(3, 'beginner'), ['full_body', 'full_body', 'full_body']);
  assertEquals(splitFor(3, 'intermediate'), ['push', 'pull', 'legs']);
});

Deno.test('four to six days split the body', () => {
  assertEquals(splitFor(4, 'beginner'), ['upper', 'lower', 'upper', 'lower']);
  assertEquals(splitFor(5, 'beginner'), ['upper', 'lower', 'push', 'pull', 'legs']);
  assertEquals(splitFor(6, 'beginner'), ['push', 'pull', 'legs', 'push', 'pull', 'legs']);
});

Deno.test('a plan needs one to six days', () => {
  assertThrows(() => splitFor(0, 'beginner'), RangeError);
  assertThrows(() => splitFor(7, 'beginner'), RangeError);
});
