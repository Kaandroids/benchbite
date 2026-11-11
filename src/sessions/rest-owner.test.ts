import { NO_WATCH } from '@/watch/types';
import { testExercise, testWorkout } from '@/workouts/test-data';

import { restOnWatch } from './rest-owner';
import { startSession, type Session } from './session';

jest.mock('expo-crypto', () => ({ randomUUID: () => 'workout-1' }));
jest.mock('expo-sqlite/kv-store', () => ({
  Storage: { getItemSync: () => null, setItemSync: () => undefined },
}));

const session = (watchFollows: boolean, byWatch = true): Session => {
  const started = startSession(
    'user-a',
    testWorkout(1, { exercises: [testExercise('bench')] }),
    {},
  );
  return {
    ...started,
    watchFollows,
    rest: { endsAt: Date.now() + 90_000, seconds: 90, ...(byWatch ? { byWatch: true } : {}) },
  };
};
const paired = { paired: true, installed: true, reachable: true };

it('leaves a rest to the watch only while it follows, paired and with the app on it', () => {
  expect(restOnWatch(session(true), paired)).toBe(true);
  // Out of reach, as with the wrist down, it still follows.
  expect(restOnWatch(session(true), { ...paired, reachable: false })).toBe(true);
  expect(restOnWatch(session(false), paired)).toBe(false);
  expect(restOnWatch(session(true), { ...paired, installed: false })).toBe(false);
  expect(restOnWatch(session(true), NO_WATCH)).toBe(false);
  expect(restOnWatch(null, paired)).toBe(false);
});

it('leaves a rest started or last changed on the phone to the phone', () => {
  expect(restOnWatch(session(true, false), paired)).toBe(false);
});
