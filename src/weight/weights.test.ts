import { QueryClient } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';
import { useSession } from '@/providers/session-provider';
import { act, createTestQueryClient, renderHook, waitFor } from '@/test/render';

import { useLatestWeight, useLogWeight } from './weights';

jest.mock('@/lib/supabase', () => ({ supabase: { from: jest.fn() } }));
jest.mock('@/providers/session-provider', () => ({ useSession: jest.fn() }));

const maybeSingle = jest.fn();
const limit = jest.fn(() => ({ maybeSingle }));
const order = jest.fn(() => ({ limit }));
const select = jest.fn(() => ({ order }));
const upsert = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(supabase.from).mockReturnValue({ select, upsert } as never);
  jest.mocked(useSession).mockReturnValue({
    status: 'ready',
    session: { user: { id: 'user-1' } } as never,
    retry: jest.fn(),
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
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['weights'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['nutrition-targets'] });
  });

  it('fails with the error the database returns', async () => {
    const error = { code: '23514', message: 'check violation' };
    upsert.mockResolvedValue({ error });
    const { result } = await renderHook(() => useLogWeight());
    await act(() => expect(result.current.mutateAsync(10)).rejects.toBe(error));
  });
});
