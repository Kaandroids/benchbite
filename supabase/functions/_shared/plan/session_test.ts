import { assertEquals } from '@std/assert';

import { exerciseSeconds, WARM_UP_SECONDS } from './session.ts';

// The same workout as 'A workout of reps and a time takes as long as in the plan builder' in
// supabase/tests/database/save_workout.test.sql, which save_workout() estimates. Change both
// together (ADR 0017).
Deno.test('estimates a workout as save_workout() does', () => {
  const curls = { sets: 3, target: { reps: { min: 10, max: 12 } }, restSeconds: 60 };
  const plank = { sets: 2, target: { seconds: 45 }, restSeconds: 60 };
  assertEquals(exerciseSeconds(curls), 288);
  assertEquals(exerciseSeconds(plank), 210);
  const seconds = WARM_UP_SECONDS + exerciseSeconds(curls) + exerciseSeconds(plank);
  assertEquals(Math.ceil(seconds / 60), 14);
});
