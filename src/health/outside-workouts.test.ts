import { supabase } from '@/lib/supabase';
import { act, renderHook, waitFor } from '@/test/render';

import { setHealthConnected, setReadSync } from './connection';
import { countByDay, outsideWorkoutsIn, useOutsideWorkoutsOn } from './outside-workouts';

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
jest.mock('@/lib/supabase', () => ({ supabase: { from: jest.fn() } }));
jest.mock('./health', () => ({
  ...jest.requireActual<typeof import('./health')>('./health'),
  healthStore: 'appleHealth',
}));

const row = (id: string, startedOn = '2026-11-10') => ({
  store: 'appleHealth',
  source_id: id,
  activity: 'running',
  started_at: `${startedOn}T07:10:00Z`,
  ended_at: `${startedOn}T07:42:00Z`,
  started_on: startedOn,
  active_kcal: 310,
  heart_rate_avg: 148,
  source: 'Apple Watch',
});

/** The list as the server gives it, a page of at most 1000 rows for each range asked for. */
function serve(pages: ReturnType<typeof row>[][]) {
  const query = {
    select: jest.fn((): unknown => query),
    gte: jest.fn((): unknown => query),
    lte: jest.fn((): unknown => query),
    lt: jest.fn((): unknown => query),
    order: jest.fn((): unknown => query),
    range: jest.fn(),
  };
  for (const page of pages) query.range.mockResolvedValueOnce({ data: page, error: null });
  jest.mocked(supabase.from).mockReturnValue(query as never);
  return query;
}

beforeEach(() => {
  jest.clearAllMocks();
  setHealthConnected(true);
  setReadSync('workouts', 'on');
});

it('reads past the server’s 1000 a page, in a range of time', async () => {
  const full = Array.from({ length: 1000 }, (_, n) => row(`w${n}`));
  const query = serve([full, [row('last')]]);
  const from = new Date('2026-10-01T00:00:00Z');
  const to = new Date('2026-11-01T00:00:00Z');
  const workouts = await outsideWorkoutsIn({ from, to });
  expect(workouts).toHaveLength(1001);
  expect(query.gte).toHaveBeenCalledWith('started_at', from.toISOString());
  expect(query.lt).toHaveBeenCalledWith('started_at', to.toISOString());
  expect(query.range.mock.calls).toEqual([
    [0, 999],
    [1000, 1999],
  ]);
});

it('counts the workouts of each day', () => {
  const [a, b, c] = [row('a'), row('b'), row('c', '2026-11-09')].map((item) => ({
    startedOn: item.started_on,
  }));
  expect(countByDay([a, b, c] as never)).toEqual({ '2026-11-10': 2, '2026-11-09': 1 });
});

it('shows none once they are no longer read, though some were read before', async () => {
  serve([[row('run')]]);
  const { result } = await renderHook(() => useOutsideWorkoutsOn('2026-11-09', '2026-11-15'));
  await waitFor(() => expect(result.current).toHaveLength(1));

  await act(() => setReadSync('workouts', 'off'));
  expect(result.current).toEqual([]);
});
