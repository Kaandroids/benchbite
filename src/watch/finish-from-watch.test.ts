import { startSession, toggleDoneUnchecked, MAX_WORKOUT_MS } from '@/sessions/session';
import { testExercise, testWorkout } from '@/workouts/test-data';

import { finishedAt } from './finish-from-watch';

jest.mock('expo-crypto', () => ({ randomUUID: () => 'workout-1' }));
jest.mock('expo-sqlite/kv-store', () => ({
  Storage: { getItemSync: () => null, setItemSync: () => undefined },
}));
jest.mock('@/lib/supabase', () => ({ supabase: {} }));

const NOW = 1_800_000_000_000;
const MINUTE = 60_000;
const start = () =>
  startSession('user-a', testWorkout(1, { exercises: [testExercise('bench')] }), {}, { now: NOW });

it('ends the workout when the watch finished it, but not before its last set', () => {
  const session = toggleDoneUnchecked(start(), 0, 0, NOW + 10 * MINUTE);
  expect(finishedAt(session, NOW + 20 * MINUTE, NOW + 30 * MINUTE)).toBe(NOW + 20 * MINUTE);
  // A set ticked on the phone after the finish is still in the workout.
  expect(finishedAt(session, NOW + 5 * MINUTE, NOW + 30 * MINUTE)).toBe(NOW + 10 * MINUTE);
  // A watch whose clock runs ahead.
  expect(finishedAt(session, NOW + 40 * MINUTE, NOW + 30 * MINUTE)).toBe(NOW + 30 * MINUTE);
});

it('ends a workout left open at the longest a workout can be', () => {
  const late = NOW + MAX_WORKOUT_MS + 60 * MINUTE;
  expect(finishedAt(start(), late, late)).toBe(NOW + MAX_WORKOUT_MS);
});
