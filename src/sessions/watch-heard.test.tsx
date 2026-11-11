import { link } from '@/watch/link';
import { NO_WATCH } from '@/watch/types';
import { resetWatchStatus } from '@/watch/watch-status';
import { act, renderHook } from '@/test/render';
import { testExercise, testWorkout } from '@/workouts/test-data';

import { startSession, type Session } from './session';
import { useHeardWatch } from './watch-heard';

jest.mock('expo-crypto', () => ({ randomUUID: () => 'workout-1' }));
jest.mock('expo-sqlite/kv-store', () => ({
  Storage: { getItemSync: () => null, setItemSync: () => undefined },
}));
jest.mock('@/watch/link', () => ({
  link: { status: jest.fn(), onStatusChange: jest.fn(() => () => undefined) },
}));

const NOW = 1_800_000_000_000;
const session = (watchFollows: boolean): Session => ({
  ...startSession('user-a', testWorkout(1, { exercises: [testExercise('bench')] }), {}),
  watchFollows,
});
const heard = {
  paired: true,
  installed: true,
  reachable: true,
  heardUntil: NOW + 75_000,
  heardRest: null,
  heartRate: 132,
};

beforeEach(() => {
  jest.useFakeTimers({ now: NOW });
  resetWatchStatus();
});

afterEach(() => {
  jest.useRealTimers();
});

it('tells the watch’s status, with its heart rate, while it is heard from about the workout', async () => {
  jest.mocked(link.status).mockResolvedValue(heard);
  const followed = session(true);
  const { result } = await renderHook(() => useHeardWatch(followed));
  expect(result.current?.heartRate).toBe(132);
  // Not heard from again, it is no longer taken to be there.
  await act(async () => {
    jest.advanceTimersByTime(75_000);
  });
  expect(result.current).toBeNull();
});

it('tells nothing of a watch that does not follow the workout, or was not heard from', async () => {
  jest.mocked(link.status).mockResolvedValue(heard);
  const notFollowed = session(false);
  const { result } = await renderHook(() => useHeardWatch(notFollowed));
  expect(result.current).toBeNull();

  resetWatchStatus();
  jest.mocked(link.status).mockResolvedValue(NO_WATCH);
  const followed = session(true);
  const unheard = await renderHook(() => useHeardWatch(followed));
  expect(unheard.result.current).toBeNull();
});
