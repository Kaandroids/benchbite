import { assertAlmostEquals } from '@std/assert';

import { estimateValues } from './estimate.ts';

Deno.test('adds up what each item gives at its grams', () => {
  const values = estimateValues([
    { grams: 180, per100: { kcal: 130, proteinG: 2.7, carbsG: 28, fatG: 0.3 } },
    { grams: 30, per100: { kcal: 156, proteinG: 1, carbsG: 36, fatG: 0.5 } },
  ]);
  assertAlmostEquals(values.kcal, 234 + 46.8);
  assertAlmostEquals(values.carbsG, 50.4 + 10.8);
});
