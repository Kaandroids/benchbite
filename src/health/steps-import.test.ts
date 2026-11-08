import { supabase } from '@/lib/supabase';
import { createTestQueryClient } from '@/test/render';

import {
  forgetHealthOnDevice,
  setHealthConnected,
  setReadSync,
  setStepsReadOn,
  stepsReadOn,
} from './connection';
import { dailySteps } from './platform';
import { importHealthSteps } from './steps-import';

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

const signedIn = (userId: string) =>
  jest
    .mocked(supabase.auth.getSession)
    .mockResolvedValue({ data: { session: { user: { id: userId } } }, error: null } as never);

const NOW = new Date(2026, 10, 8, 9, 0);
const MIDNIGHT = new Date(2026, 10, 8);
const DAYS = [
  { day: '2026-11-07', steps: 11340 },
  { day: '2026-11-08', steps: 6248 },
];

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers({ now: NOW, advanceTimers: true });
  forgetHealthOnDevice();
  setHealthConnected(true);
  setReadSync('steps', 'on');
  signedIn('user-1');
  jest.mocked(dailySteps).mockResolvedValue(DAYS as never);
  jest.mocked(supabase.rpc).mockResolvedValue({ data: 2, error: null } as never);
});
afterEach(() => jest.useRealTimers());

const daysBack = (from: Date) => Math.round((MIDNIGHT.getTime() - from.getTime()) / 86_400_000);

it('reads the last year the first time and sends each day, then refreshes the steps', async () => {
  const queryClient = createTestQueryClient();
  const invalidate = jest.spyOn(queryClient, 'invalidateQueries');

  expect(await importHealthSteps(queryClient)).toBe(true);

  const [from, to] = jest.mocked(dailySteps).mock.calls[0]!;
  expect(daysBack(from)).toBe(365);
  expect(to).toEqual(NOW);
  expect(supabase.rpc).toHaveBeenCalledWith('import_steps', { days: DAYS, today: '2026-11-08' });
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ['steps'] });
  expect(stepsReadOn()).toBe('2026-11-08');
});

it('reads the last 30 days after that, for a watch that syncs late', async () => {
  await importHealthSteps(createTestQueryClient());
  await importHealthSteps(createTestQueryClient());

  expect(daysBack(jest.mocked(dailySteps).mock.calls[1]![0])).toBe(29);
});

it('reads on from the day last read, after weeks without a read', async () => {
  setStepsReadOn('2026-09-24');

  await importHealthSteps(createTestQueryClient());

  expect(daysBack(jest.mocked(dailySteps).mock.calls[0]![0])).toBe(45);
});

it('reads a year back at most, however long ago the last read was', async () => {
  setStepsReadOn('2024-01-01');

  await importHealthSteps(createTestQueryClient());

  expect(daysBack(jest.mocked(dailySteps).mock.calls[0]![0])).toBe(365);
});

it('keeps the day last read when the steps could not be sent', async () => {
  jest.mocked(supabase.rpc).mockResolvedValue({ data: null, error: new Error('offline') } as never);

  await expect(importHealthSteps(createTestQueryClient())).rejects.toThrow('offline');
  expect(stepsReadOn()).toBeNull();
});

it('refreshes nothing when no day changed', async () => {
  jest.mocked(supabase.rpc).mockResolvedValue({ data: 0, error: null } as never);
  const queryClient = createTestQueryClient();
  const invalidate = jest.spyOn(queryClient, 'invalidateQueries');

  expect(await importHealthSteps(queryClient)).toBe(false);
  expect(invalidate).not.toHaveBeenCalled();
});

it('sends nothing when another user signed in while the store was read', async () => {
  jest.mocked(dailySteps).mockImplementation(async () => {
    signedIn('user-2');
    return DAYS;
  });

  expect(await importHealthSteps(createTestQueryClient())).toBe(false);
  expect(supabase.rpc).not.toHaveBeenCalled();
});

it('reads nothing while steps are not read or the store not connected', async () => {
  setReadSync('steps', 'off');
  expect(await importHealthSteps(createTestQueryClient())).toBe(false);
  setReadSync('steps', 'on');
  setHealthConnected(false);
  expect(await importHealthSteps(createTestQueryClient())).toBe(false);

  expect(dailySteps).not.toHaveBeenCalled();
});

it('reads the store once for imports asked for at the same time', async () => {
  const queryClient = createTestQueryClient();

  await Promise.all([importHealthSteps(queryClient), importHealthSteps(queryClient)]);

  expect(dailySteps).toHaveBeenCalledTimes(1);
});

it('reads as far back again when a read found no steps, as before they could be read', async () => {
  jest.mocked(dailySteps).mockResolvedValueOnce([]);

  await importHealthSteps(createTestQueryClient());
  expect(stepsReadOn()).toBeNull();

  await importHealthSteps(createTestQueryClient());
  expect(daysBack(jest.mocked(dailySteps).mock.calls[1]![0])).toBe(365);
});

it('keeps no day read for a user who signed in while the steps were sent', async () => {
  jest.mocked(supabase.rpc).mockImplementation((() => {
    signedIn('user-2');
    forgetHealthOnDevice();
    return Promise.resolve({ data: 2, error: null });
  }) as never);

  await importHealthSteps(createTestQueryClient());

  expect(stepsReadOn()).toBeNull();
});
