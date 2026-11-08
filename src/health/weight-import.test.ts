import { supabase } from '@/lib/supabase';
import { createTestQueryClient } from '@/test/render';

import { setHealthConnected, setWeightSync } from './connection';
import { weightsSince } from './platform';
import { importHealthWeights, latestPerDay } from './weight-import';

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

const NOW = new Date(2026, 10, 8, 9, 0);
const DAY_MS = 24 * 3600 * 1000;
const at = (day: number, hour: number) => new Date(2026, 10, day, hour, 0);

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers({ now: NOW, advanceTimers: true });
  setHealthConnected(true);
  setWeightSync('on');
  jest.mocked(weightsSince).mockResolvedValue([
    { at: at(7, 7), weightKg: 84.6, source: 'Withings' },
    { at: at(8, 7), weightKg: 84.4, source: 'Withings' },
  ] as never);
  jest.mocked(supabase.rpc).mockResolvedValue({ data: 2, error: null } as never);
});
afterEach(() => jest.useRealTimers());

it('keeps the latest weighing of each day, oldest day first', () => {
  expect(
    latestPerDay([
      { at: at(8, 21), weightKg: 85, source: 'Zepp' },
      { at: at(7, 7), weightKg: 84.6, source: null },
      { at: at(8, 7), weightKg: 84.4, source: 'Withings' },
    ]),
  ).toEqual([
    { day: '2026-11-07', weightKg: 84.6, source: null },
    { day: '2026-11-08', weightKg: 85, source: 'Zepp' },
  ]);
});

it('reads the last 30 days and sends the latest of each, then refreshes the weights', async () => {
  const queryClient = createTestQueryClient();
  const invalidate = jest.spyOn(queryClient, 'invalidateQueries');

  expect(await importHealthWeights(queryClient)).toBe(true);

  expect(jest.mocked(weightsSince).mock.calls[0]![0]).toEqual(
    new Date(NOW.getTime() - 30 * DAY_MS),
  );
  expect(supabase.rpc).toHaveBeenCalledWith('import_weights', {
    weights: [
      { day: '2026-11-07', weightKg: 84.6, source: 'Withings' },
      { day: '2026-11-08', weightKg: 84.4, source: 'Withings' },
    ],
    today: '2026-11-08',
  });
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ['weights'] });
});

it('reads all 30 days again each time, for a weighing a scale’s app wrote days late', async () => {
  await importHealthWeights(createTestQueryClient());
  await importHealthWeights(createTestQueryClient());

  for (const [from] of jest.mocked(weightsSince).mock.calls) {
    expect(from).toEqual(new Date(NOW.getTime() - 30 * DAY_MS));
  }
});

it('refreshes nothing when no day changed', async () => {
  jest.mocked(supabase.rpc).mockResolvedValue({ data: 0, error: null } as never);
  const queryClient = createTestQueryClient();
  const invalidate = jest.spyOn(queryClient, 'invalidateQueries');

  expect(await importHealthWeights(queryClient)).toBe(false);
  expect(invalidate).not.toHaveBeenCalled();
});

it('sends nothing without a weighing', async () => {
  jest.mocked(weightsSince).mockResolvedValue([]);

  expect(await importHealthWeights(createTestQueryClient())).toBe(false);
  expect(supabase.rpc).not.toHaveBeenCalled();
});

it('says when the weights could not be sent', async () => {
  jest.mocked(supabase.rpc).mockResolvedValue({ data: null, error: new Error('offline') } as never);

  await expect(importHealthWeights(createTestQueryClient())).rejects.toThrow('offline');
});

it('reads nothing while weight is not read or the store not connected', async () => {
  setWeightSync('off');
  expect(await importHealthWeights(createTestQueryClient())).toBe(false);
  setWeightSync(null);
  expect(await importHealthWeights(createTestQueryClient())).toBe(false);
  setWeightSync('on');
  setHealthConnected(false);
  expect(await importHealthWeights(createTestQueryClient())).toBe(false);

  expect(weightsSince).not.toHaveBeenCalled();
});
