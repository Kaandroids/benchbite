import { supabase } from '@/lib/supabase';
import { act, renderHook } from '@/test/render';
import { testExercise, testWorkout } from '@/workouts/test-data';

import { useSaveWorkout } from './save-workout';
import { activeSession, resetSessionStore, startSession, toggleDoneUnchecked } from './session';

jest.mock('expo-crypto', () => ({ randomUUID: () => 'workout-1' }));
jest.mock('expo-sqlite/kv-store', () => ({
  Storage: {
    getItemSync: () => null,
    setItemSync: () => undefined,
    removeItemSync: () => undefined,
  },
}));
jest.mock('@/lib/supabase', () => ({ supabase: { rpc: jest.fn() } }));
jest.mock('@/health/health-catch-up', () => ({ afterWorkoutLogged: jest.fn() }));

const NOW = 1_800_000_000_000;

beforeEach(() => {
  jest.clearAllMocks();
  resetSessionStore();
});

it('saves a workout saved from two places at once once, with the first one’s end', async () => {
  let respond: (value: unknown) => void = () => undefined;
  jest.mocked(supabase.rpc).mockReturnValue(new Promise((resolve) => (respond = resolve)) as never);
  const session = toggleDoneUnchecked(
    startSession(
      'user-a',
      testWorkout(1, { exercises: [testExercise('bench')] }),
      {},
      { now: NOW },
    ),
    0,
    0,
    NOW + 60_000,
  );
  const { result } = await renderHook(() => useSaveWorkout());
  let saves: Promise<number>[] = [];
  await act(async () => {
    saves = [
      result.current.save(session, NOW + 120_000),
      result.current.save(session, NOW + 180_000),
    ];
  });
  expect(supabase.rpc).toHaveBeenCalledTimes(1);
  expect(supabase.rpc).toHaveBeenCalledWith('log_workout', {
    log: expect.objectContaining({ finishedAt: new Date(NOW + 120_000).toISOString() }),
  });
  await act(async () => respond({ data: 12, error: null }));
  await expect(Promise.all(saves)).resolves.toEqual([12, 12]);
  expect(activeSession()).toBeNull();
});
