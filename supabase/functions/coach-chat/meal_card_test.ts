import { assertEquals } from '@std/assert';

import type { MealCard } from '../_shared/coach/chat.ts';
import { mealAt, mealCardText } from './meal_card.ts';

Deno.test('takes the meal of the time of day, and a snack without one', () => {
  assertEquals(
    ['03:59', '04:00', '10:59', '11:00', '14:59', '15:00', '17:00', '21:59', '22:00'].map(mealAt),
    ['snack', 'breakfast', 'breakfast', 'lunch', 'lunch', 'snack', 'dinner', 'dinner', 'snack'],
  );
  assertEquals(mealAt(undefined), 'snack');
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
      per100: { kcal: 130, proteinG: 2.7, carbsG: 28, fatG: 0.3 },
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
