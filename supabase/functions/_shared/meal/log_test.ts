import { assertEquals } from '@std/assert';

import { logItemOf } from './log.ts';

const PER100 = { kcal: 130, proteinG: 2.7, carbsG: 28, fatG: 0.3 };

Deno.test('logs a found food by its id, and another item by its search name and values', () => {
  const found = (kind: 'library' | 'custom' | 'recipe', id: string | number, name: string) => ({
    name: 'Rice',
    searchName: 'Rice, boiled',
    grams: 180,
    confidence: 0.7,
    food: { ref: { kind, id } as never, name },
    per100: PER100,
    estimated: false,
  });
  assertEquals(logItemOf(found('library', 'C1', 'Rice, boiled')), { food_id: 'C1', grams: 180 });
  assertEquals(logItemOf(found('custom', 4, 'Rice, boiled (mine)')), {
    custom_food_id: 4,
    grams: 180,
  });
  assertEquals(logItemOf(found('recipe', 5, 'Rice, boiled')), { recipe_id: 5, grams: 180 });
  assertEquals(
    logItemOf({
      name: 'Dal',
      searchName: 'Dal makhani',
      grams: 250,
      confidence: 0.5,
      per100: { kcal: 140, proteinG: 6, carbsG: 14, fatG: 7 },
      estimated: true,
    }),
    {
      name: 'Dal makhani',
      grams: 250,
      kcal: 140,
      protein_g: 6,
      carbs_g: 14,
      fat_g: 7,
    },
  );
});

Deno.test('logs an own food of exactly the search name by its name and values', () => {
  // So that it still logs when that food is gone: log_meal_estimate() finds it by its name,
  // or makes it again.
  assertEquals(
    logItemOf({
      name: 'Rice',
      searchName: 'rice, boiled ',
      grams: 180,
      confidence: 0.7,
      food: { ref: { kind: 'custom', id: 4 }, name: 'Rice, boiled' },
      per100: PER100,
      estimated: false,
    }),
    { name: 'Rice, boiled', grams: 180, kcal: 130, protein_g: 2.7, carbs_g: 28, fat_g: 0.3 },
  );
});
