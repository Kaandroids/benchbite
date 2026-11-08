import { recentLogs } from '@/history/history';
import { supabase } from '@/lib/supabase';
import { createTestQueryClient } from '@/test/render';

import { setHealthConnected } from './connection';
import { catchUpWorkoutHealth } from './health-catch-up';
import { workoutStats } from './platform';

jest.mock('expo-sqlite/kv-store', () => {
  const items = new Map<string, string>();
  return {
    Storage: {
      getItemSync: (key: string) => items.get(key) ?? null,
      setItemSync: (key: string, value: string) => void items.set(key, value),
      removeItemSync: (key: string) => void items.delete(key),
    },
  };
});
jest.mock('@/lib/supabase', () => ({ supabase: { rpc: jest.fn() } }));
jest.mock('@/history/history', () => ({ LOGS_KEY: ['workout-logs'], recentLogs: jest.fn() }));

const STATS = {
  heartRate: { average: 131.6, max: 168 },
  activeKcal: 411.7,
  source: 'Apple Watch',
  samples: null,
};
const log = (id: number) => ({
  id,
  startedAt: new Date('2026-11-08T18:04:00Z'),
  finishedAt: new Date('2026-11-08T18:56:00Z'),
});

beforeEach(() => {
  jest.clearAllMocks();
  setHealthConnected(true);
  jest.mocked(workoutStats).mockResolvedValue(STATS);
  jest.mocked(recentLogs).mockResolvedValue([log(7), log(8)]);
  jest.mocked(supabase.rpc).mockResolvedValue({ data: true, error: null } as never);
});

it('reads the last day’s workouts again and sends each read, then refreshes the logs', async () => {
  const queryClient = createTestQueryClient();
  const invalidate = jest.spyOn(queryClient, 'invalidateQueries');

  expect(await catchUpWorkoutHealth(queryClient)).toBe(true);

  const since = jest.mocked(recentLogs).mock.calls[0]![0];
  expect(Date.now() - since.getTime()).toBeCloseTo(24 * 3600 * 1000, -4);
  expect(supabase.rpc).toHaveBeenCalledTimes(2);
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ['workout-logs'] });
});

it('refreshes nothing when no read changed a log', async () => {
  jest.mocked(supabase.rpc).mockResolvedValue({ data: false, error: null } as never);
  const queryClient = createTestQueryClient();
  const invalidate = jest.spyOn(queryClient, 'invalidateQueries');

  expect(await catchUpWorkoutHealth(queryClient)).toBe(false);

  expect(invalidate).not.toHaveBeenCalled();
});

it('goes on after a log that fails, as one deleted meanwhile', async () => {
  jest
    .mocked(supabase.rpc)
    .mockResolvedValueOnce({ data: null, error: { code: 'BB013' } } as never)
    .mockResolvedValueOnce({ data: true, error: null } as never);
  const queryClient = createTestQueryClient();
  const invalidate = jest.spyOn(queryClient, 'invalidateQueries');

  expect(await catchUpWorkoutHealth(queryClient)).toBe(true);

  expect(supabase.rpc).toHaveBeenCalledTimes(2);
  expect(invalidate).toHaveBeenCalled();
});

it('does nothing while the store is not connected', async () => {
  setHealthConnected(false);
  expect(await catchUpWorkoutHealth(createTestQueryClient())).toBe(false);
  expect(recentLogs).not.toHaveBeenCalled();
});
