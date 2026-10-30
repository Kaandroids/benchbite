import { assertEquals } from '@std/assert';

import { readExpression, snapshotText } from './prompt.ts';

Deno.test('reads the expression an answer starts with, once it can tell', () => {
  assertEquals(readExpression(''), undefined);
  assertEquals(readExpression('[[sur'), undefined);
  assertEquals(readExpression('[[sad]] Oh no.'), { expression: 'sad', rest: 'Oh no.' });
  assertEquals(readExpression(' [[angry]]Leg day!'), { expression: 'angry', rest: 'Leg day!' });
  assertEquals(readExpression('[[sleepy]] Hm.'), { expression: 'neutral', rest: 'Hm.' });
  assertEquals(readExpression('Hello'), { expression: 'neutral', rest: 'Hello' });
});

Deno.test("writes the snapshot in the user's units and language", () => {
  const text = snapshotText(
    {
      date: '2026-10-30',
      weekday: 'Friday',
      profile: {
        name: 'Sam',
        age: 28,
        sex: 'male',
        heightCm: 182,
        weightUnit: 'lb',
        pregnantOrBreastfeeding: false,
        calorieFloor: 1500,
      },
      weightKg: 82.4,
      goal: 'lose fat to 78 kg',
      workouts: 'Pull (not done yet)',
    },
    'de',
  );

  assertEquals(text.split('\n'), [
    '# Snapshot (2026-10-30, Friday)',
    'Reply in: German',
    'User: Sam · 28 years · male · 182 cm · 82.4 kg',
    'Units: pounds',
    'Calorie floor: 1500 kcal a day',
    'Pregnant or breastfeeding: no',
    'Goal: lose fat to 78 kg',
    "Today's workouts: Pull (not done yet)",
  ]);
});
