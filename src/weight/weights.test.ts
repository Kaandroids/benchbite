import { QueryClient } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';
import { useSession } from '@/providers/session-provider';
import { STREAK_KEY } from '@/streak/streak';
import { act, createTestQueryClient, renderHook, waitFor } from '@/test/render';
import { sessionValue } from '@/test/context-mocks';

import {
  useLatestWeight,
  useLogWeight,
  useWeightHistory,
  useWeightUnit,
  weightChange,
} from './weights';

jest.mock('@/lib/supabase', () => ({ supabase: { from: jest.fn(), rpc: jest.fn() } }));
jest.mock('@/providers/session-provider', () => ({ useSession: jest.fn() }));

const maybeSingle = jest.fn();
const limit = jest.fn(() => ({ maybeSingle }));
const order = jest.fn(() => ({ limit }));
const select = jest.fn(() => ({ order, maybeSingle }));
const upsert = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(supabase.from).mockReturnValue({ select, upsert } as never);
  jest.mocked(supabase.rpc).mockResolvedValue({ data: null, error: null } as never);
  jest.mocked(useSession).mockReturnValue(sessionValue('user-1'));
});

describe('useWeightUnit', () => {
  it('loads the unit from the profile', async () => {
    maybeSingle.mockResolvedValue({ data: { weight_unit: 'lb' }, error: null });
    const { result } = await renderHook(() => useWeightUnit());
    await waitFor(() => expect(result.current.data).toBe('lb'));
    expect(supabase.from).toHaveBeenCalledWith('profiles');
    expect(select).toHaveBeenCalledWith('weight_unit');
  });

  it('is kilograms without a profile', async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null });
    const { result } = await renderHook(() => useWeightUnit());
    await waitFor(() => expect(result.current.data).toBe('kg'));
  });
});

describe('useLatestWeight', () => {
  it('loads the most recent entry', async () => {
    maybeSingle.mockResolvedValue({
      data: { weight_kg: 79.5, measured_on: '2026-10-21' },
      error: null,
    });
    const { result } = await renderHook(() => useLatestWeight());
    await waitFor(() =>
      expect(result.current.data).toEqual({ weightKg: 79.5, measuredOn: '2026-10-21' }),
    );
    expect(supabase.from).toHaveBeenCalledWith('weight_entries');
    expect(order).toHaveBeenCalledWith('measured_on', { ascending: false });
  });

  it('is null before the first entry', async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null });
    const { result } = await renderHook(() => useLatestWeight());
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
  });
});

describe('useLogWeight', () => {
  // 1 AM in the device's time zone, which may still be the day before in UTC.
  beforeEach(() =>
    jest.useFakeTimers({ now: new Date(2026, 9, 22, 1, 0), doNotFake: ['nextTick'] }),
  );
  afterEach(() => jest.useRealTimers());

  it("saves the weight for today's date on the device and loads the weights and targets again", async () => {
    upsert.mockResolvedValue({ error: null });
    const queryClient: QueryClient = createTestQueryClient();
    const invalidate = jest.spyOn(queryClient, 'invalidateQueries');
    const { result } = await renderHook(() => useLogWeight(), { queryClient });
    await act(() => result.current.mutateAsync(79.5));
    expect(upsert).toHaveBeenCalledWith(
      { user_id: 'user-1', weight_kg: 79.5, measured_on: '2026-10-22' },
      { onConflict: 'user_id,measured_on' },
    );
    // Today follows the targets the new weight gives, on the device's date (ADR 0040).
    expect(supabase.rpc).toHaveBeenCalledWith('refresh_day_nutrition_targets', {
      from_day: '2026-10-22',
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['weights'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['nutrition-targets'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: STREAK_KEY });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['meal-entries', 'days'] });
  });

  it('saves one weight at a time, in the order they were made', async () => {
    let finishFirst = () => {};
    upsert
      .mockReturnValueOnce(
        new Promise((resolve) => {
          finishFirst = () => resolve({ error: null });
        }),
      )
      .mockResolvedValueOnce({ error: null });
    const { result } = await renderHook(() => useLogWeight());
    await act(async () => {
      result.current.mutate(79.6);
      result.current.mutate(79.7);
    });
    // The second waits for the first, so the first cannot reach the database last.
    expect(upsert).toHaveBeenCalledTimes(1);
    await act(async () => finishFirst());
    await waitFor(() => expect(upsert).toHaveBeenCalledTimes(2));
    expect(upsert.mock.calls.map(([entry]) => entry.weight_kg)).toEqual([79.6, 79.7]);
  });

  it('fails with the error the database returns', async () => {
    const error = { code: '23514', message: 'check violation' };
    upsert.mockResolvedValue({ error });
    const { result } = await renderHook(() => useLogWeight());
    await act(() => expect(result.current.mutateAsync(10)).rejects.toBe(error));
  });
});

describe('useWeightHistory', () => {
  it("loads the range's weights, oldest first", async () => {
    const gte = jest.fn(() => ({
      order: jest.fn().mockResolvedValue({
        data: [
          { weight_kg: 86.4, measured_on: '2026-10-01' },
          { weight_kg: 85, measured_on: '2026-10-29' },
        ],
        error: null,
      }),
    }));
    jest.mocked(supabase.from).mockReturnValue({ select: () => ({ gte }) } as never);
    const { result } = await renderHook(() =>
      useWeightHistory('month', new Date(2026, 9, 29, 9, 0)),
    );
    await waitFor(() =>
      expect(result.current.data).toEqual([
        { weightKg: 86.4, measuredOn: '2026-10-01' },
        { weightKg: 85, measuredOn: '2026-10-29' },
      ]),
    );
    expect(gte).toHaveBeenCalledWith('measured_on', '2026-09-29');
  });
});

describe('weightChange', () => {
  it('is the last weight less the first, to a tenth', () => {
    expect(
      weightChange([
        { weightKg: 86.4, measuredOn: '2026-10-01' },
        { weightKg: 85.9, measuredOn: '2026-10-15' },
        { weightKg: 85, measuredOn: '2026-10-29' },
      ]),
    ).toBe(-1.4);
  });

  it('is unknown with fewer than two weights', () => {
    expect(weightChange([{ weightKg: 85, measuredOn: '2026-10-29' }])).toBeNull();
    expect(weightChange([])).toBeNull();
  });
});
