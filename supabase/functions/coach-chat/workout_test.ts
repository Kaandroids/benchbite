import { assertEquals } from '@std/assert';

import { workoutName } from './workout.ts';

Deno.test('names a workout without a name by its type', () => {
  assertEquals(workoutName({ name: '', type: 'full_body' }), 'full body');
  assertEquals(workoutName({ name: 'Push', type: 'push' }), 'Push');
});
