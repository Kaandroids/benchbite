import { supabase } from '@/lib/supabase';
import { createTestQueryClient, renderHook, waitFor } from '@/test/render';

import { useWeekMoves } from './moves';

jest.mock('@/lib/supabase', () => ({ supabase: { from: jest.fn() } }));

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
