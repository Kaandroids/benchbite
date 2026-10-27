import { supabase } from '@/lib/supabase';
import { useSession } from '@/providers/session-provider';
import { sessionValue } from '@/test/context-mocks';
import { act, createTestQueryClient, renderHook, waitFor } from '@/test/render';

import { useAddWater, useSetWaterGoal, useWater, useWaterGoal } from './water';

jest.mock('@/lib/supabase', () => ({ supabase: { from: jest.fn(), rpc: jest.fn() } }));
jest.mock('@/providers/session-provider', () => ({ useSession: jest.fn() }));

const maybeSingle = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(useSession).mockReturnValue(sessionValue('user-1'));
});

describe('useWater', () => {
  it("loads the day's total, and 0 before the first glass", async () => {
    const eq = jest.fn(() => ({ maybeSingle }));
    jest.mocked(supabase.from).mockReturnValue({ select: () => ({ eq }) } as never);
    maybeSingle.mockResolvedValueOnce({ data: { ml: 750 }, error: null });
    const { result } = await renderHook(() => useWater('2026-10-27'));
    await waitFor(() => expect(result.current.data).toBe(750));
    expect(supabase.from).toHaveBeenCalledWith('water_days');
    expect(eq).toHaveBeenCalledWith('day', '2026-10-27');

    maybeSingle.mockResolvedValueOnce({ data: null, error: null });
    const { result: empty } = await renderHook(() => useWater('2026-10-26'));
    await waitFor(() => expect(empty.current.data).toBe(0));
  });
});

describe('useAddWater', () => {
  it('shows the glass at once, then the total the database counted', async () => {
    let finish = (_total: number) => {};
    jest
      .mocked(supabase.rpc)
      .mockReturnValue(
        new Promise(
          (resolve) => (finish = (total) => resolve({ data: total, error: null })),
        ) as never,
      );
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(['water', '2026-10-27'], 500);
    const { result } = await renderHook(() => useAddWater('2026-10-27'), { queryClient });

    await act(async () => result.current.mutate(250));
    await waitFor(() => expect(queryClient.getQueryData(['water', '2026-10-27'])).toBe(750));
    expect(supabase.rpc).toHaveBeenCalledWith('add_water', {
      on_day: '2026-10-27',
      amount_ml: 250,
    });
    await act(async () => finish(750));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(queryClient.getQueryData(['water', '2026-10-27'])).toBe(750);
  });

  it('puts the total back when the glass could not be saved', async () => {
    jest.mocked(supabase.rpc).mockResolvedValue({ data: null, error: { code: 'BB020' } } as never);
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(['water', '2026-10-27'], 500);
    const { result } = await renderHook(() => useAddWater('2026-10-27'), { queryClient });
    await act(async () => result.current.mutate(-250));
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(queryClient.getQueryData(['water', '2026-10-27'])).toBe(500);
  });
});

describe('useWaterGoal', () => {
  it('loads the goal, and 2 L without a profile', async () => {
    jest.mocked(supabase.from).mockReturnValue({ select: () => ({ maybeSingle }) } as never);
    maybeSingle.mockResolvedValueOnce({ data: null, error: null });
    const { result } = await renderHook(() => useWaterGoal());
    await waitFor(() => expect(result.current.data).toBe(2000));
  });
});

describe('useSetWaterGoal', () => {
  it("changes the user's goal", async () => {
    const eq = jest.fn().mockResolvedValue({ error: null });
    const update = jest.fn(() => ({ eq }));
    jest.mocked(supabase.from).mockReturnValue({ update } as never);
    const { result } = await renderHook(() => useSetWaterGoal());
    await act(() => result.current.mutateAsync(2500));
    expect(update).toHaveBeenCalledWith({ water_goal_ml: 2500 });
    expect(eq).toHaveBeenCalledWith('user_id', 'user-1');
  });
});
