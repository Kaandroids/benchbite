import { recentLogs } from '@/history/history';
import { createTestQueryClient } from '@/test/render';

import { setHealthConnected, setWriteSince, writeSince } from './connection';
import { removeWorkout, saveWorkout, storedWorkouts, writeAllowed } from './platform';
import { removeSavedWorkout, saveRecentWorkouts, saveToHealth } from './workout-write';

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
  jest.mocked(writeAllowed).mockResolvedValue(true);
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
    expect(saveWorkout).not.toHaveBeenCalled();
  });

  it('still takes out a copy saved before saving was turned off and on again', async () => {
    setWriteSince(new Date('2026-11-08T19:00:00Z'));
    jest.mocked(storedWorkouts).mockResolvedValue({ ours: { activeKcal: 312 }, others: true });
    expect(await saveToHealth(log(7))).toBe('recorded');
    expect(removeWorkout).toHaveBeenCalledWith(7);
    expect(saveWorkout).not.toHaveBeenCalled();
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

  it('saves a workout finished during a run in a run after it', async () => {
    let release: (logs: ReturnType<typeof log>[]) => void = () => undefined;
    jest
      .mocked(recentLogs)
      .mockReturnValueOnce(new Promise((resolve) => (release = resolve)))
      .mockResolvedValueOnce([log(7), log(8)]);
    const queryClient = createTestQueryClient();

    const running = saveRecentWorkouts(queryClient);
    const finished = saveRecentWorkouts(queryClient);
    await Promise.resolve();
    release([log(7)]);
    await Promise.all([running, finished]);

    expect(recentLogs).toHaveBeenCalledTimes(2);
    expect(saveWorkout).toHaveBeenCalledWith(saved(8));
  });

  it('turns saving off when the system took writing back', async () => {
    jest.mocked(writeAllowed).mockResolvedValue(false);
    await saveRecentWorkouts(createTestQueryClient());
    expect(recentLogs).not.toHaveBeenCalled();
    expect(writeSince()).toBeNull();
  });

  it('reads no logs while saving is off', async () => {
    setWriteSince(null);
    await saveRecentWorkouts(createTestQueryClient());
    expect(recentLogs).not.toHaveBeenCalled();
  });
});

describe('removeSavedWorkout', () => {
  it('takes a deleted log’s copy out of the store, while workouts are saved', async () => {
    await removeSavedWorkout(7);
    expect(removeWorkout).toHaveBeenCalledWith(7);
  });

  it('leaves the store alone while saving is off', async () => {
    setWriteSince(null);
    await removeSavedWorkout(7);
    expect(removeWorkout).not.toHaveBeenCalled();
  });
});

describe('the connection', () => {
  it('stops saving when the store is disconnected', () => {
    expect(writeSince()).toEqual(SINCE);
    setHealthConnected(false);
    expect(writeSince()).toBeNull();
  });
});
