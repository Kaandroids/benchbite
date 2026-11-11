import { testExercise, testWorkout } from '@/workouts/test-data';

import {
  endOfWatchFinish,
  MAX_WORKOUT_MS,
  startClock,
  startSession,
  stopClock,
  toggleDoneUnchecked,
} from './session';

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
  expect(endOfWatchFinish(session, NOW + 20 * MINUTE, NOW + 30 * MINUTE)).toBe(NOW + 20 * MINUTE);
  // A set ticked on the phone after the finish is still in the workout.
  expect(endOfWatchFinish(session, NOW + 5 * MINUTE, NOW + 30 * MINUTE)).toBe(NOW + 10 * MINUTE);
  // A watch whose clock runs ahead.
  expect(endOfWatchFinish(session, NOW + 40 * MINUTE, NOW + 30 * MINUTE)).toBe(NOW + 30 * MINUTE);
});

it('ends a workout left open at the longest a workout can be', () => {
  const late = NOW + MAX_WORKOUT_MS + 60 * MINUTE;
  expect(endOfWatchFinish(start(), late, late)).toBe(NOW + MAX_WORKOUT_MS);
});

it('ends now when a clock started after the watch finished, as when its clock runs behind', () => {
  const running = startClock(start(), 0, 0, NOW + 20 * MINUTE);
  const end = endOfWatchFinish(running, NOW + 19 * MINUTE, NOW + 21 * MINUTE);
  expect(end).toBe(NOW + 21 * MINUTE);
  expect(stopClock(running, end).exercises[0]?.sets[0]?.seconds).toBe(60);
});
