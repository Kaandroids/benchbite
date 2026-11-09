import { recentLogs } from '@/history/history';
import { createTestQueryClient } from '@/test/render';

import { setHealthConnected, setWriteSince, writeSince } from './connection';
import { removeWorkout, saveWorkout, storedWorkouts } from './platform';
import { saveRecentWorkouts, saveToHealth } from './workout-write';

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
jest.mock('@/history/history', () => ({ recentLogs: jest.fn() }));

const SINCE = new Date('2026-11-08T12:00:00Z');
const log = (id: number, kcal: number | null = 312) => ({
  id,
  kcal,
  startedAt: new Date('2026-11-08T18:04:00Z'),
  finishedAt: new Date('2026-11-08T18:56:00Z'),
});
const saved = (id: number, kcal: number | null = 312) => ({
  logId: id,
  start: log(id).startedAt,
  end: log(id).finishedAt,
  activeKcal: kcal,
});

beforeEach(() => {
  jest.clearAllMocks();
  setHealthConnected(true);
  setWriteSince(SINCE);
  jest.mocked(storedWorkouts).mockResolvedValue({ ours: null, others: false });
});

describe('saveToHealth', () => {
  it('saves a workout the store has none in its time of', async () => {
    expect(await saveToHealth(log(7))).toBe('saved');
    expect(storedWorkouts).toHaveBeenCalledWith(7, log(7).startedAt, log(7).finishedAt);
    expect(saveWorkout).toHaveBeenCalledWith(saved(7));
  });

  it('leaves a copy alone whose calories are the log’s', async () => {
    jest.mocked(storedWorkouts).mockResolvedValue({ ours: { activeKcal: 311.6 }, others: false });
    expect(await saveToHealth(log(7))).toBe('saved');
    expect(saveWorkout).not.toHaveBeenCalled();
  });

  it('saves a copy again once the log’s calories changed, as when the watch measured them', async () => {
    jest.mocked(storedWorkouts).mockResolvedValue({ ours: { activeKcal: 250 }, others: false });
    expect(await saveToHealth(log(7, 401))).toBe('saved');
    expect(saveWorkout).toHaveBeenCalledWith(saved(7, 401));
  });

  it('saves no copy of a workout the watch recorded', async () => {
    jest.mocked(storedWorkouts).mockResolvedValue({ ours: null, others: true });
    expect(await saveToHealth(log(7))).toBe('recorded');
    expect(saveWorkout).not.toHaveBeenCalled();
    expect(removeWorkout).not.toHaveBeenCalled();
  });

  it('takes its copy out when the watch’s workout turned up later', async () => {
    jest.mocked(storedWorkouts).mockResolvedValue({ ours: { activeKcal: 312 }, others: true });
    expect(await saveToHealth(log(7))).toBe('recorded');
    expect(removeWorkout).toHaveBeenCalledWith(7);
    expect(saveWorkout).not.toHaveBeenCalled();
  });

  it('saves no workout finished before saving was turned on', async () => {
    setWriteSince(new Date('2026-11-08T19:00:00Z'));
    expect(await saveToHealth(log(7))).toBeNull();
    expect(storedWorkouts).not.toHaveBeenCalled();
  });

  it('saves nothing while saving is off or the store is disconnected', async () => {
    setWriteSince(null);
    expect(await saveToHealth(log(7))).toBeNull();
    setWriteSince(SINCE);
    setHealthConnected(false);
    expect(await saveToHealth(log(7))).toBeNull();
    expect(storedWorkouts).not.toHaveBeenCalled();
  });
});

describe('saveRecentWorkouts', () => {
  it('saves the last day’s workouts, going on past one that fails', async () => {
    jest.mocked(recentLogs).mockResolvedValue([log(7), log(8)]);
    jest.mocked(saveWorkout).mockRejectedValueOnce(new Error('denied'));
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const queryClient = createTestQueryClient();
    const invalidate = jest.spyOn(queryClient, 'invalidateQueries');

    await saveRecentWorkouts(queryClient);
    expect(saveWorkout).toHaveBeenCalledWith(saved(7));
    expect(saveWorkout).toHaveBeenCalledWith(saved(8));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['saved-to-health'] });
  });

  it('reads no logs while saving is off', async () => {
    setWriteSince(null);
    await saveRecentWorkouts(createTestQueryClient());
    expect(recentLogs).not.toHaveBeenCalled();
  });
});

describe('the connection', () => {
  it('stops saving when the store is disconnected', () => {
    expect(writeSince()).toEqual(SINCE);
    setHealthConnected(false);
    expect(writeSince()).toBeNull();
  });
});
