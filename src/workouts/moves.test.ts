import { supabase } from '@/lib/supabase';
import { act, createTestQueryClient, renderHook, waitFor } from '@/test/render';

import { MOVES_KEY, useMoveWorkout, useUndoMove, useWeekMoves } from './moves';

jest.mock('@/lib/supabase', () => ({ supabase: { from: jest.fn(), rpc: jest.fn() } }));

describe('useWeekMoves', () => {
  it("loads the moves from the days of today's week, Monday to Sunday", async () => {
    const lte = jest.fn().mockResolvedValue({
      data: [{ workout_id: 7, from_on: '2026-10-19', to_on: null }],
      error: null,
    });
    const gte = jest.fn(() => ({ lte }));
    jest.mocked(supabase.from).mockReturnValue({ select: () => ({ gte }) } as never);
    const { result } = await renderHook(() => useWeekMoves(new Date(2026, 9, 21, 9, 0)), {
      queryClient: createTestQueryClient(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(supabase.from).toHaveBeenCalledWith('workout_moves');
    expect(gte).toHaveBeenCalledWith('from_on', '2026-10-19');
    expect(lte).toHaveBeenCalledWith('from_on', '2026-10-25');
    expect(result.current.data).toEqual([{ workoutId: 7, fromOn: '2026-10-19', toOn: null }]);
  });
});

describe('useMoveWorkout', () => {
  it('moves the workout and loads the moves again', async () => {
    jest.mocked(supabase.rpc).mockResolvedValue({ error: null } as never);
    const queryClient = createTestQueryClient();
    const invalidate = jest.spyOn(queryClient, 'invalidateQueries');
    const { result } = await renderHook(() => useMoveWorkout(), { queryClient });
    await act(() =>
      result.current.mutateAsync({ workoutId: 7, fromOn: '2026-10-19', toOn: '2026-10-21' }),
    );
    expect(supabase.rpc).toHaveBeenCalledWith('move_workout', {
      workout_id: 7,
      from_on: '2026-10-19',
      to_on: '2026-10-21',
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: MOVES_KEY });
  });

  it('loads the moves again when the move is refused', async () => {
    jest.mocked(supabase.rpc).mockResolvedValue({ error: { code: 'BB019' } } as never);
    const queryClient = createTestQueryClient();
    const invalidate = jest.spyOn(queryClient, 'invalidateQueries');
    const { result } = await renderHook(() => useMoveWorkout(), { queryClient });
    await expect(
      act(() => result.current.mutateAsync({ workoutId: 7, fromOn: '2026-10-19', toOn: null })),
    ).rejects.toEqual({ code: 'BB019' });
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: MOVES_KEY }));
  });
});

describe('useUndoMove', () => {
  it("deletes the workout's move from that day", async () => {
    const second = jest.fn().mockResolvedValue({ error: null });
    const first = jest.fn(() => ({ eq: second }));
    jest.mocked(supabase.from).mockReturnValue({ delete: () => ({ eq: first }) } as never);
    const queryClient = createTestQueryClient();
    const invalidate = jest.spyOn(queryClient, 'invalidateQueries');
    const { result } = await renderHook(() => useUndoMove(), { queryClient });
    await act(() => result.current.mutateAsync({ workoutId: 7, fromOn: '2026-10-19' }));
    expect(supabase.from).toHaveBeenCalledWith('workout_moves');
    expect(first).toHaveBeenCalledWith('workout_id', 7);
    expect(second).toHaveBeenCalledWith('from_on', '2026-10-19');
    expect(invalidate).toHaveBeenCalledWith({ queryKey: MOVES_KEY });
  });
});
