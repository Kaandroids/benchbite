import { finishedWeekKey } from '@/history/history';
import { createTestQueryClient, renderHook } from '@/test/render';
import { weekMovesKey } from '@/workouts/moves';
import { WORKOUTS_KEY, type Workout } from '@/workouts/workouts';

import { useCachedWeekSchedule } from './use-week-schedule';

jest.mock('@/lib/supabase', () => ({ supabase: {} }));

// Wednesday, October 21.
const WEDNESDAY = new Date(2026, 9, 21, 9, 0);

const PUSH: Workout = {
  id: 1,
  name: 'Push',
  type: null,
  weekdays: [1],
  active: true,
  estimatedMinutes: 45,
  exercises: [],
};

describe('useCachedWeekSchedule', () => {
  it('reads the week from the cache when it is called', async () => {
    const queryClient = createTestQueryClient();
    const { result } = await renderHook(() => useCachedWeekSchedule(), { queryClient });
    expect(result.current(WEDNESDAY)).toBeUndefined();

    queryClient.setQueryData(WORKOUTS_KEY, [PUSH]);
    queryClient.setQueryData(weekMovesKey(WEDNESDAY), [
      { workoutId: 1, fromOn: '2026-10-19', toOn: '2026-10-21' },
    ]);
    expect(result.current(WEDNESDAY)).toBeUndefined();
    queryClient.setQueryData(finishedWeekKey(WEDNESDAY), [
      { workoutId: 1, startedOn: '2026-10-21' },
    ]);
    // The same function sees what was cached after it was made.
    expect(result.current(WEDNESDAY)?.days[2]?.workouts).toEqual([
      expect.objectContaining({ status: 'done', movedFrom: '2026-10-19' }),
    ]);
  });
});
