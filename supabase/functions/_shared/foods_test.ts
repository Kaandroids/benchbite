import { assertEquals } from '@std/assert';

import { nameKey } from './foods.ts';

Deno.test('compares names as food_name_key() does, trimmed', () => {
  assertEquals(nameKey(' Kırmızı İnce '), 'kirmizi ince');
});
