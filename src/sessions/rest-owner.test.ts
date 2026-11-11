import { NO_WATCH } from '@/watch/types';
import { testExercise, testWorkout } from '@/workouts/test-data';

import { restOnWatch } from './rest-owner';
import { startSession, type Session } from './session';

jest.mock('expo-crypto', () => ({ randomUUID: () => 'workout-1' }));
jest.mock('expo-sqlite/kv-store', () => ({
  Storage: { getItemSync: () => null, setItemSync: () => undefined },
}));

const NOW = 1_800_000_000_000;
const session = (watchFollows: boolean): Session => ({
  ...startSession('user-a', testWorkout(1, { exercises: [testExercise('bench')] }), {}),
  watchFollows,
});
const heard = { paired: true, installed: true, reachable: false, heardUntil: NOW + 65_000 };

it('leaves the rest to the watch while it follows, with the app on it, and was heard lately', () => {
  expect(restOnWatch(session(true), heard, NOW)).toBe(true);
  // Out of reach, as with the wrist down, it is still heard from.
  expect(restOnWatch(session(true), { ...heard, reachable: false }, NOW)).toBe(true);
  expect(restOnWatch(session(false), heard, NOW)).toBe(false);
  expect(restOnWatch(session(true), { ...heard, installed: false }, NOW)).toBe(false);
  expect(restOnWatch(session(true), NO_WATCH, NOW)).toBe(false);
  expect(restOnWatch(null, heard, NOW)).toBe(false);
});

it('takes the rest back once the time the watch was heard for is up', () => {
  expect(restOnWatch(session(true), { ...heard, heardUntil: NOW + 1 }, NOW)).toBe(true);
  expect(restOnWatch(session(true), { ...heard, heardUntil: NOW }, NOW)).toBe(false);
  // A watch that never sent a sign, as one whose workout session cannot run.
  expect(restOnWatch(session(true), { ...heard, heardUntil: null }, NOW)).toBe(false);
});
