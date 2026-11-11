import { startSession, type Session } from '@/sessions/session';
import { testExercise, testWorkout } from '@/workouts/test-data';

import { NO_WATCH } from './types';
import { watchSignalsRest } from './watch-status';

jest.mock('expo-crypto', () => ({ randomUUID: () => 'workout-1' }));
jest.mock('expo-sqlite/kv-store', () => ({
  Storage: { getItemSync: () => null, setItemSync: () => undefined },
}));

const session = (watchFollows: boolean): Session => ({
  ...startSession('user-a', testWorkout(1, { exercises: [testExercise('bench')] }), {}),
  watchFollows,
});
const paired = { paired: true, installed: true, reachable: false };

it('leaves the rest to the watch only while it follows, paired and with the app on it', () => {
  expect(watchSignalsRest(session(true), paired)).toBe(true);
  // Out of reach, as with the wrist down, it still follows.
  expect(watchSignalsRest(session(true), { ...paired, reachable: false })).toBe(true);
  expect(watchSignalsRest(session(false), paired)).toBe(false);
  expect(watchSignalsRest(session(true), { ...paired, installed: false })).toBe(false);
  expect(watchSignalsRest(session(true), NO_WATCH)).toBe(false);
  expect(watchSignalsRest(null, paired)).toBe(false);
});
