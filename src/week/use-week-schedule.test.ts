import { finishedWeekKey } from '@/history/history';
import { createTestQueryClient, renderHook } from '@/test/render';
import { weekMovesKey } from '@/workouts/moves';
import { plannedWeekKey } from '@/workouts/planned-week';
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
    queryClient.setQueryData(plannedWeekKey(WEDNESDAY), [
      { day: '2026-10-19', workoutId: 1, name: 'Push', type: null },
    ]);
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

describe('useCachedWeekSchedule with kept days', () => {
  it('plans a past day as it kept its plan, though the plan changed since', async () => {
    const queryClient = createTestQueryClient();
    const { result } = await renderHook(() => useCachedWeekSchedule(), { queryClient });
    // Push is on Tuesdays now; Monday kept it, and Legs, deleted since and done that day.
    queryClient.setQueryData(WORKOUTS_KEY, [{ ...PUSH, weekdays: [2] }]);
    queryClient.setQueryData(plannedWeekKey(WEDNESDAY), [
      { day: '2026-10-19', workoutId: 1, name: 'Push', type: null },
      { day: '2026-10-19', workoutId: 9, name: 'Legs', type: 'legs' },
      { day: '2026-10-20', workoutId: 1, name: 'Push', type: null },
    ]);
    queryClient.setQueryData(weekMovesKey(WEDNESDAY), []);
    queryClient.setQueryData(finishedWeekKey(WEDNESDAY), [
      { workoutId: null, startedOn: '2026-10-19' },
    ]);
    const monday = result.current(WEDNESDAY)?.days[0];
    expect(monday?.workouts).toEqual([
      expect.objectContaining({
        status: 'missed',
        session: expect.objectContaining({ name: 'Push' }),
      }),
      expect.objectContaining({
        status: 'done',
        session: expect.objectContaining({ name: 'Legs', left: 'deleted' }),
      }),
    ]);
  });
});
