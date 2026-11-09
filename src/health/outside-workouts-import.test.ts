import { supabase } from '@/lib/supabase';
import { createTestQueryClient } from '@/test/render';

import {
  forgetHealthOnDevice,
  setHealthConnected,
  setReadSync,
  setWorkoutsReadOn,
  workoutsReadOn,
} from './connection';
import { importOutsideWorkouts, MOST_PER_PART, partsOf } from './outside-workouts-import';
import { keptFigures } from './outside-workouts';
import { outsideWorkouts } from './platform';
import type { OutsideWorkout } from './types';

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
jest.mock('@/lib/supabase', () => ({
  supabase: { rpc: jest.fn(), auth: { getSession: jest.fn() } },
}));
jest.mock('./outside-workouts', () => ({
  ...jest.requireActual<typeof import('./outside-workouts')>('./outside-workouts'),
  keptFigures: jest.fn(),
}));
jest.mock('./health', () => ({
  ...jest.requireActual<typeof import('./health')>('./health'),
  healthStore: 'appleHealth',
}));

const signedIn = (userId: string) =>
  jest
    .mocked(supabase.auth.getSession)
    .mockResolvedValue({ data: { session: { user: { id: userId } } }, error: null } as never);

const NOW = new Date(2026, 10, 10, 9, 0);
const MIDNIGHT = new Date(2026, 10, 10);
const workout = (id: string, start: Date): OutsideWorkout => ({
  id,
  activity: 'running',
  start,
  end: new Date(start.getTime() + 32 * 60_000),
  activeKcal: 310,
  heartRateAvg: 148,
  source: 'Apple Watch',
});
const RUN = workout('run', new Date(2026, 10, 10, 7, 10));

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers({ now: NOW, advanceTimers: true });
  forgetHealthOnDevice();
  setHealthConnected(true);
  setReadSync('workouts', 'on');
  signedIn('user-1');
  jest.mocked(outsideWorkouts).mockResolvedValue([RUN]);
  jest.mocked(supabase.rpc).mockResolvedValue({ data: 1, error: null } as never);
  jest.mocked(keptFigures).mockResolvedValue(new Map());
});
afterEach(() => jest.useRealTimers());

const daysBack = (from: Date) => Math.round((MIDNIGHT.getTime() - from.getTime()) / 86_400_000);

it('reads the last 30 days the first time and sends them as the truth for that time', async () => {
  const queryClient = createTestQueryClient();
  const invalidate = jest.spyOn(queryClient, 'invalidateQueries');

  expect(await importOutsideWorkouts(queryClient)).toBe(true);

  const [from] = jest.mocked(outsideWorkouts).mock.calls[0]!;
  expect(daysBack(from)).toBe(29);
  expect(supabase.rpc).toHaveBeenCalledWith('import_outside_workouts', {
    workouts: [
      {
        id: 'run',
        activity: 'running',
        startedAt: RUN.start.toISOString(),
        endedAt: RUN.end.toISOString(),
        startedOn: '2026-11-10',
        activeKcal: 310,
        heartRateAvg: 148,
        source: 'Apple Watch',
      },
    ],
    health_store: 'appleHealth',
    since: from.toISOString(),
    until: new Date(NOW.getTime() + 60_000).toISOString(),
    today: '2026-11-10',
  });
  expect(workoutsReadOn()).toBe('2026-11-10');
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ['outside-workouts'] });
});

it('goes on from the day last read, a year back at most', async () => {
  setWorkoutsReadOn('2026-08-01');
  await importOutsideWorkouts(createTestQueryClient());
  expect(daysBack(jest.mocked(outsideWorkouts).mock.calls[0]![0])).toBe(101);

  setWorkoutsReadOn('2024-01-01');
  await importOutsideWorkouts(createTestQueryClient());
  expect(daysBack(jest.mocked(outsideWorkouts).mock.calls[1]![0])).toBe(365);
});

it('still sends a read without workouts, as they were deleted in the store', async () => {
  jest.mocked(outsideWorkouts).mockResolvedValue([]);
  await importOutsideWorkouts(createTestQueryClient());
  expect(supabase.rpc).toHaveBeenCalledWith(
    'import_outside_workouts',
    expect.objectContaining({ workouts: [] }),
  );
});

it('sends nothing, and reads as far back next time, when the store could not be read', async () => {
  setWorkoutsReadOn('2026-08-01');
  jest.mocked(outsideWorkouts).mockResolvedValue(null);
  expect(await importOutsideWorkouts(createTestQueryClient())).toBe(false);
  expect(supabase.rpc).not.toHaveBeenCalled();
  expect(workoutsReadOn()).toBe('2026-08-01');
});

it('reads nothing while workouts are not read', async () => {
  setReadSync('workouts', 'off');
  expect(await importOutsideWorkouts(createTestQueryClient())).toBe(false);
  expect(outsideWorkouts).not.toHaveBeenCalled();
});

it('takes the kept figures of workouts older than three days, not reading them again', async () => {
  const figures = new Map([['ride', { activeKcal: 540, heartRateAvg: 132 }]]);
  jest.mocked(keptFigures).mockResolvedValue(figures);
  await importOutsideWorkouts(createTestQueryClient());
  const [from, , kept] = jest.mocked(outsideWorkouts).mock.calls[0]!;
  expect(keptFigures).toHaveBeenCalledWith('appleHealth', from);
  expect(kept).toEqual({ figures, before: new Date(2026, 10, 8) });
});

it('sends no later part for a user who signed in while an earlier one was sent', async () => {
  const many = Array.from({ length: MOST_PER_PART + 1 }, (_, n) =>
    workout(`w${n}`, new Date(2026, 10, 1, 0, n)),
  );
  jest.mocked(outsideWorkouts).mockResolvedValue(many);
  jest.mocked(supabase.rpc).mockImplementation((async () => {
    signedIn('user-2');
    return { data: 1, error: null };
  }) as never);
  expect(await importOutsideWorkouts(createTestQueryClient())).toBe(false);
  expect(supabase.rpc).toHaveBeenCalledTimes(1);
});

it('sends nothing for a user who signed in while the store was read', async () => {
  jest.mocked(outsideWorkouts).mockImplementation(async () => {
    signedIn('user-2');
    return [RUN];
  });
  expect(await importOutsideWorkouts(createTestQueryClient())).toBe(false);
  expect(supabase.rpc).not.toHaveBeenCalled();
});

describe('partsOf', () => {
  const from = new Date(2026, 9, 1);
  const until = new Date(2026, 10, 10);
  const minutes = (n: number) => new Date(from.getTime() + n * 60_000);

  it('sends up to 500 in one part over the whole time', () => {
    expect(partsOf([RUN], from, until)).toEqual([{ since: from, until, workouts: [RUN] }]);
    expect(partsOf([], from, until)).toEqual([{ since: from, until, workouts: [] }]);
  });

  it('splits more than 500 where the next part starts, so the parts cover the time', () => {
    const many = Array.from({ length: MOST_PER_PART + 20 }, (_, n) => workout(`w${n}`, minutes(n)));
    const parts = partsOf(many, from, until);
    expect(parts.map((part) => part.workouts.length)).toEqual([MOST_PER_PART, 20]);
    expect(parts[0]!.since).toBe(from);
    expect(parts[0]!.until).toEqual(minutes(MOST_PER_PART));
    expect(parts[1]!.since).toEqual(minutes(MOST_PER_PART));
    expect(parts[1]!.until).toBe(until);
  });

  it('never ends a part among workouts that start at the same moment', () => {
    const many = Array.from({ length: MOST_PER_PART + 2 }, (_, n) =>
      workout(`w${n}`, minutes(n < MOST_PER_PART - 1 ? n : MOST_PER_PART)),
    );
    const parts = partsOf(many, from, until);
    expect(parts.map((part) => part.workouts.length)).toEqual([MOST_PER_PART - 1, 3]);
    expect(parts[0]!.until).toEqual(minutes(MOST_PER_PART));
  });
});
