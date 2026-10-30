import { assertEquals } from '@std/assert';

import { FaceReader, snapshotText } from './prompt.ts';

const read = (...chunks: string[]) => {
  const face = new FaceReader();
  const out = chunks.map((chunk) => face.push(chunk));
  out.push(face.end());
  return {
    expression: out.find((o) => o.expression)?.expression,
    text: out.map((o) => o.text).join(''),
  };
};

Deno.test('reads the face an answer starts with, across chunks', () => {
  assertEquals(read('[[sur', 'prised]] Wow', '!'), { expression: 'surprised', text: 'Wow!' });
  assertEquals(read(' [[angry]]Leg day!'), { expression: 'angry', text: 'Leg day!' });
  assertEquals(read('[[sleepy]] Hm.'), { expression: 'neutral', text: 'Hm.' });
});

Deno.test('takes an answer without a face as neutral, holding nothing back', () => {
  assertEquals(read('Hello', ' there'), { expression: 'neutral', text: 'Hello there' });
  assertEquals(read('[1] first'), { expression: 'neutral', text: '[1] first' });
  assertEquals(read('[[hap'), { expression: 'neutral', text: '[[hap' });
  assertEquals(read(''), { expression: undefined, text: '' });
});

Deno.test("writes the snapshot as data, in the user's units and language", () => {
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
      workouts: 'Pull planned, 0 done',
    },
    'de',
  );

  assertEquals(text.split('\n'), [
    '<snapshot>',
    'Date: 2026-10-30, Friday',
    'Reply in: German',
    'User: Sam · 28 years · male · 182 cm · 82.4 kg',
    'Units: pounds',
    'Pregnant or breastfeeding: no',
    'Calorie floor: 1500 kcal a day',
    'Goal: lose fat to 78 kg',
    "Today's workouts: Pull planned, 0 done",
    '</snapshot>',
  ]);
});

Deno.test('names every face in the rules', async () => {
  const { SYSTEM } = await import('./prompt.ts');
  assertEquals(
    SYSTEM.includes('[[neutral]], [[happy]], [[sad]], [[angry]] or [[surprised]]'),
    true,
  );
});
