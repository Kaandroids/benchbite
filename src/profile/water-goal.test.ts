import { supabase } from '@/lib/supabase';
import { useSession } from '@/providers/session-provider';
import { sessionValue } from '@/test/context-mocks';
import { act, createTestQueryClient, renderHook, waitFor } from '@/test/render';

import { useSetWaterGoal, useWaterGoal } from './water-goal';

jest.mock('@/lib/supabase', () => ({ supabase: { from: jest.fn() } }));
jest.mock('@/providers/session-provider', () => ({ useSession: jest.fn() }));

const maybeSingle = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(useSession).mockReturnValue(sessionValue('user-1'));
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

describe('useSetWaterGoal, changed quickly', () => {
  it('shows each goal at once, and loads the goal again once the last is saved', async () => {
    const answers: (() => void)[] = [];
    const eq = jest.fn(
      () => new Promise((resolve) => answers.push(() => resolve({ error: null }))),
    );
    jest.mocked(supabase.from).mockReturnValue({ update: () => ({ eq }) } as never);
    const queryClient = createTestQueryClient();
    const invalidate = jest.spyOn(queryClient, 'invalidateQueries');
    queryClient.setQueryData(['profile', 'water-goal'], 2000);
    const { result } = await renderHook(() => useSetWaterGoal(), { queryClient });

    await act(async () => result.current.mutate(2500));
    await act(async () => result.current.mutate(3000));
    await waitFor(() => expect(queryClient.getQueryData(['profile', 'water-goal'])).toBe(3000));
    await act(async () => answers[1]!());
    await act(async () => answers[0]!());
    await waitFor(() => expect(invalidate).toHaveBeenCalledTimes(1));
    expect(queryClient.getQueryData(['profile', 'water-goal'])).toBe(3000);
  });
});
