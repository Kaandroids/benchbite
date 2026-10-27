import { supabase } from '@/lib/supabase';
import { act, createTestQueryClient, renderHook, waitFor } from '@/test/render';

import { useAddWater, useWater } from './water';

jest.mock('@/lib/supabase', () => ({ supabase: { from: jest.fn(), rpc: jest.fn() } }));

const maybeSingle = jest.fn();

beforeEach(() => jest.clearAllMocks());

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

/** An add_water() call that answers when the test says so. */
function pendingRpc() {
  const calls: { answer: (error: unknown) => void }[] = [];
  jest.mocked(supabase.rpc).mockImplementation(
    () =>
      new Promise((resolve) => {
        calls.push({ answer: (error) => resolve({ data: null, error } as never) });
      }) as never,
  );
  return calls;
}

describe('useAddWater', () => {
  it('shows the glass at once, and loads the day again once it is saved', async () => {
    const calls = pendingRpc();
    const queryClient = createTestQueryClient();
    const invalidate = jest.spyOn(queryClient, 'invalidateQueries');
    queryClient.setQueryData(['water', '2026-10-27'], 500);
    const { result } = await renderHook(() => useAddWater('2026-10-27'), { queryClient });

    await act(async () => result.current.mutate(250));
    await waitFor(() => expect(queryClient.getQueryData(['water', '2026-10-27'])).toBe(750));
    expect(supabase.rpc).toHaveBeenCalledWith('add_water', {
      on_day: '2026-10-27',
      amount_ml: 250,
    });
    expect(invalidate).not.toHaveBeenCalled();
    await act(async () => calls[0]!.answer(null));
    await waitFor(() =>
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ['water', '2026-10-27'] }),
    );
  });

  it('counts quick taps together, whatever order their answers come in', async () => {
    const calls = pendingRpc();
    const queryClient = createTestQueryClient();
    const invalidate = jest.spyOn(queryClient, 'invalidateQueries');
    queryClient.setQueryData(['water', '2026-10-27'], 500);
    const { result } = await renderHook(() => useAddWater('2026-10-27'), { queryClient });

    await act(async () => result.current.mutate(250));
    await act(async () => result.current.mutate(250));
    await waitFor(() => expect(queryClient.getQueryData(['water', '2026-10-27'])).toBe(1000));
    await act(async () => calls[1]!.answer(null));
    expect(queryClient.getQueryData(['water', '2026-10-27'])).toBe(1000);
    expect(invalidate).not.toHaveBeenCalled();
    await act(async () => calls[0]!.answer(null));
    await waitFor(() => expect(invalidate).toHaveBeenCalledTimes(1));
  });

  it('loads the day again when a glass could not be saved', async () => {
    const calls = pendingRpc();
    const queryClient = createTestQueryClient();
    const invalidate = jest.spyOn(queryClient, 'invalidateQueries');
    queryClient.setQueryData(['water', '2026-10-27'], 500);
    const { result } = await renderHook(() => useAddWater('2026-10-27'), { queryClient });

    await act(async () => result.current.mutate(250));
    await act(async () => result.current.mutate(250));
    await act(async () => calls[0]!.answer({ code: 'BB020' }));
    expect(invalidate).not.toHaveBeenCalled();
    await act(async () => calls[1]!.answer(null));
    await waitFor(() => expect(invalidate).toHaveBeenCalledTimes(1));
  });

  it('never shows less than nothing', async () => {
    pendingRpc();
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(['water', '2026-10-27'], 0);
    const { result } = await renderHook(() => useAddWater('2026-10-27'), { queryClient });
    await act(async () => result.current.mutate(-250));
    await waitFor(() => expect(supabase.rpc).toHaveBeenCalled());
    expect(queryClient.getQueryData(['water', '2026-10-27'])).toBe(0);
  });
});
