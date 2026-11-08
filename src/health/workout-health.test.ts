import { supabase } from '@/lib/supabase';
import { createTestQueryClient } from '@/test/render';

import { setHealthConnected } from './connection';
import { workoutStats } from './platform';
import { NO_WORKOUT_STATS } from './types';
import {
  catchUpWorkoutHealth,
  keepWorkoutHealth,
  readWorkoutHealth,
  usableStats,
} from './workout-health';

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
jest.mock('@/lib/supabase', () => ({ supabase: { rpc: jest.fn(), from: jest.fn() } }));

const FROM = new Date('2026-11-08T18:04:00Z');
const TO = new Date('2026-11-08T18:56:00Z');
const STATS = { averageBpm: 131.6, maxBpm: 168, activeKcal: 411.7, source: 'Apple Watch' };

beforeEach(() => {
  jest.clearAllMocks();
  setHealthConnected(true);
  jest.mocked(workoutStats).mockResolvedValue(STATS);
  jest.mocked(supabase.rpc).mockResolvedValue({ data: null, error: null } as never);
});

describe('readWorkoutHealth', () => {
  it('reads the store for the workout’s time', async () => {
    expect(await readWorkoutHealth(FROM, TO)).toEqual(STATS);
    expect(workoutStats).toHaveBeenCalledWith(FROM, TO);
  });

  it('reads nothing while the store is not connected', async () => {
    setHealthConnected(false);
    expect(await readWorkoutHealth(FROM, TO)).toBeNull();
    expect(workoutStats).not.toHaveBeenCalled();
  });

  it('gives nothing when the store cannot be read', async () => {
    jest.mocked(workoutStats).mockRejectedValue(new Error('denied'));
    expect(await readWorkoutHealth(FROM, TO)).toBeNull();
  });
});

describe('usableStats', () => {
  it('keeps a heart rate a person can have, with its calories', () => {
    expect(usableStats(STATS)).toEqual(STATS);
  });

  it('drops a read whose highest is a spike, or without a heart rate, calories included', () => {
    for (const stats of [
      { ...STATS, maxBpm: 262 },
      { ...STATS, averageBpm: null, maxBpm: null },
      { averageBpm: null, maxBpm: null, activeKcal: 6, source: 'iPhone' },
    ]) {
      expect(usableStats(stats)).toEqual(NO_WORKOUT_STATS);
    }
  });
});

describe('keepWorkoutHealth', () => {
  it('sends what a read found: the heart rate, the calories and their source', async () => {
    expect(await keepWorkoutHealth(7, STATS)).toBe(true);
    expect(supabase.rpc).toHaveBeenCalledWith('set_workout_health', {
      log_id: 7,
      heart_rate_avg: 131.6,
      heart_rate_max: 168,
      active_kcal: 411.7,
      source: 'Apple Watch',
    });
  });

  it('leaves out calories the read did not find', async () => {
    await keepWorkoutHealth(7, { ...STATS, activeKcal: null });
    expect(supabase.rpc).toHaveBeenCalledWith('set_workout_health', {
      log_id: 7,
      heart_rate_avg: 131.6,
      heart_rate_max: 168,
      source: 'Apple Watch',
    });
  });

  it('sends nothing without a heart rate', async () => {
    expect(await keepWorkoutHealth(7, NO_WORKOUT_STATS)).toBe(false);
    expect(supabase.rpc).not.toHaveBeenCalled();
  });
});

describe('catchUpWorkoutHealth', () => {
  function logs(rows: object[]) {
    type Query = {
      select: () => Query;
      gte: jest.Mock<Query>;
      limit: jest.Mock<Promise<{ data: object[]; error: null }>>;
    };
    const query: Query = {
      select: () => query,
      gte: jest.fn(() => query),
      limit: jest.fn(() => Promise.resolve({ data: rows, error: null })),
    };
    jest.mocked(supabase.from).mockReturnValue(query as never);
    return query;
  }

  it('reads the last day’s logs again, keeps what each read found, and refreshes them', async () => {
    const query = logs([
      {
        id: 7,
        started_at: FROM.toISOString(),
        finished_at: TO.toISOString(),
      },
    ]);
    const queryClient = createTestQueryClient();
    const invalidate = jest.spyOn(queryClient, 'invalidateQueries');

    expect(await catchUpWorkoutHealth(queryClient)).toBe(true);

    expect(query.gte).toHaveBeenCalled();
    expect(workoutStats).toHaveBeenCalledWith(FROM, TO);
    expect(supabase.rpc).toHaveBeenCalledWith('set_workout_health', {
      log_id: 7,
      heart_rate_avg: 131.6,
      heart_rate_max: 168,
      active_kcal: 411.7,
      source: 'Apple Watch',
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['workout-logs'] });
  });

  it('does nothing while the store is not connected', async () => {
    setHealthConnected(false);
    expect(await catchUpWorkoutHealth(createTestQueryClient())).toBe(false);
    expect(supabase.from).not.toHaveBeenCalled();
  });
});
