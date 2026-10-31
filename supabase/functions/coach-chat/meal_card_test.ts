import { assertEquals } from '@std/assert';

import type { MealCard } from '../_shared/coach/chat.ts';
import { logItem, mealAt, mealCardText } from './meal_card.ts';

Deno.test('takes the meal of the time of day, and a snack without one', () => {
  assertEquals(
    ['03:59', '04:00', '10:59', '11:00', '14:59', '15:00', '17:00', '21:59', '22:00'].map(mealAt),
    ['snack', 'breakfast', 'breakfast', 'lunch', 'lunch', 'snack', 'dinner', 'dinner', 'snack'],
  );
  assertEquals(mealAt(undefined), 'snack');
});

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
  assertEquals(logItem(found('library', 'C1', 'Rice, boiled')), { food_id: 'C1', grams: 180 });
  assertEquals(logItem(found('custom', 4, 'Rice, boiled (mine)')), {
    custom_food_id: 4,
    grams: 180,
  });
  assertEquals(logItem(found('recipe', 5, 'Rice, boiled')), { recipe_id: 5, grams: 180 });
  assertEquals(
    logItem({
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
  // So that the card still logs when that food is gone: log_meal_estimate() finds it by its name,
  // or makes it again.
  assertEquals(
    logItem({
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

const CARD: MealCard = {
  id: 51,
  day: '2026-10-30',
  meal: 'dinner',
  items: [
    {
      name: 'Chicken breast',
      searchName: 'Chicken breast, grilled',
      grams: 150,
      confidence: 0.8,
      per100: { kcal: 165, proteinG: 31, carbsG: 0, fatG: 3.6 },
      estimated: true,
    },
    {
      name: 'Rice',
      searchName: 'Rice',
      grams: 180,
      confidence: 0.7,
      per100: PER100,
      estimated: true,
    },
  ],
};

Deno.test('reads a card back with where it stands', () => {
  const card = '(Meal card for dinner on 2026-10-30: Chicken breast 150 g, Rice 180 g; 482 kcal.';
  assertEquals(mealCardText(CARD), `${card})`);
  assertEquals(
    mealCardText(CARD, { id: 51, status: 'pending', kcal: null }),
    `${card} Not added yet.)`,
  );
  // Added with other grams, it says what was logged.
  assertEquals(
    mealCardText(CARD, { id: 51, status: 'logged', kcal: 413.5 }),
    `${card} Added by the user, 414 kcal.)`,
  );
  assertEquals(
    mealCardText(CARD, { id: 51, status: 'undone', kcal: 413.5 }),
    `${card} Added, then undone by the user.)`,
  );
});
