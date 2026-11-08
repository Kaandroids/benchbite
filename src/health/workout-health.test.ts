import { supabase } from '@/lib/supabase';

import { setHealthConnected } from './connection';
import { workoutStats } from './platform';
import { NO_WORKOUT_STATS } from './types';
import { hasHeartRate, keepWorkoutHealth, readWorkoutHealth } from './workout-health';

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

const FROM = new Date('2026-11-08T18:04:00Z');
const TO = new Date('2026-11-08T18:56:00Z');
const STATS = {
  heartRate: { average: 131.6, max: 168 },
  activeKcal: 411.7,
  source: 'Apple Watch',
  samples: null,
};

beforeEach(() => {
  jest.clearAllMocks();
  setHealthConnected(true);
  jest.mocked(workoutStats).mockResolvedValue(STATS);
  jest.mocked(supabase.rpc).mockResolvedValue({ data: true, error: null } as never);
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

describe('hasHeartRate', () => {
  it('takes a heart rate a person can have, rounded as the server rounds it', () => {
    expect(hasHeartRate(STATS)).toBe(true);
    expect(hasHeartRate({ ...STATS, heartRate: { average: 120, max: 250.4 } })).toBe(true);
  });

  it('shows nothing without one, or with a spike', () => {
    expect(hasHeartRate(NO_WORKOUT_STATS)).toBe(false);
    expect(hasHeartRate(null)).toBe(false);
    expect(hasHeartRate({ ...STATS, heartRate: { average: 140, max: 262 } })).toBe(false);
  });
});

describe('keepWorkoutHealth', () => {
  it('sends a read, and tells whether it changed the log', async () => {
    expect(await keepWorkoutHealth(7, STATS)).toBe(true);
    expect(supabase.rpc).toHaveBeenCalledWith('set_workout_health', {
      log_id: 7,
      heart_rate_avg: 131.6,
      heart_rate_max: 168,
      active_kcal: 411.7,
      source: 'Apple Watch',
    });

    jest.mocked(supabase.rpc).mockResolvedValue({ data: false, error: null } as never);
    expect(await keepWorkoutHealth(7, STATS)).toBe(false);
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
