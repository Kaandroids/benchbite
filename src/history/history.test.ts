import { supabase } from '@/lib/supabase';
import { act, createTestQueryClient, renderHook, waitFor } from '@/test/render';

import {
  byWeek,
  doneOf,
  durationMinutes,
  fetchLogSummaries,
  useDeleteLog,
  useLoggedSets,
  weekStart,
  type LogSummary,
} from './history';

jest.mock('@/lib/supabase', () => ({ supabase: { from: jest.fn() } }));

const log = (id: number, started: string, minutes: number): LogSummary => {
  const startedAt = new Date(started);
  return {
    id,
    workoutId: 1,
    name: null,
    type: 'push',
    startedAt,
    finishedAt: new Date(startedAt.getTime() + minutes * 60_000),
    exercises: 6,
    plannedExercises: null,
    sets: 10,
    plannedSets: null,
    kilograms: 1000,
    estimatedKcal: 300,
  };
};

beforeEach(() => jest.clearAllMocks());

describe('fetchLogSummaries', () => {
  it('reads the summaries, latest first', async () => {
    const order = jest.fn().mockResolvedValue({
      data: [
        {
          id: 7,
          workout_id: null,
          name: 'Arms',
          type: null,
          started_at: '2026-10-23T16:00:00Z',
          finished_at: '2026-10-23T16:52:00Z',
          exercises: 6,
          planned_exercises: 8,
          sets: 17,
          planned_sets: 24,
          kilograms: 6240.5,
          estimated_kcal: null,
        },
      ],
      error: null,
    });
    jest.mocked(supabase.from).mockReturnValue({ select: () => ({ order }) } as never);
    const [summary] = await fetchLogSummaries();
    expect(supabase.from).toHaveBeenCalledWith('workout_log_summaries');
    expect(order).toHaveBeenCalledWith('finished_at', { ascending: false });
    expect(summary).toEqual({
      id: 7,
      workoutId: null,
      name: 'Arms',
      type: null,
      startedAt: new Date('2026-10-23T16:00:00Z'),
      finishedAt: new Date('2026-10-23T16:52:00Z'),
      exercises: 6,
      plannedExercises: 8,
      sets: 17,
      plannedSets: 24,
      kilograms: 6240.5,
      estimatedKcal: null,
    });
    expect(durationMinutes(summary!)).toBe(52);
  });
});

describe('useLoggedSets', () => {
  it('reads the sets of a log in order', async () => {
    const second = jest.fn().mockResolvedValue({
      data: [
        {
          exercise_position: 0,
          set_position: 0,
          exercise_id: 'bench',
          weight_kg: 80,
          reps: 8,
          seconds: null,
          meters: null,
        },
      ],
      error: null,
    });
    const eq = jest.fn(() => ({ order: () => ({ order: second }) }));
    jest.mocked(supabase.from).mockReturnValue({ select: () => ({ eq }) } as never);
    const { result } = await renderHook(() => useLoggedSets(7), {
      queryClient: createTestQueryClient(),
    });
    await waitFor(() => expect(result.current.data).toHaveLength(1));
    expect(eq).toHaveBeenCalledWith('log_id', 7);
    expect(result.current.data?.[0]).toEqual({
      exercisePosition: 0,
      exerciseId: 'bench',
      weightKg: 80,
      reps: 8,
      seconds: null,
      meters: null,
    });
  });
});

describe('useDeleteLog', () => {
  it('deletes the log and drops it from the list at once', async () => {
    const eq = jest.fn().mockResolvedValue({ error: null });
    jest.mocked(supabase.from).mockReturnValue({ delete: () => ({ eq }) } as never);
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(
      ['workout-logs'],
      [log(1, '2026-10-20T18:00', 50), log(2, '2026-10-21T18:00', 50)],
    );
    jest.spyOn(queryClient, 'invalidateQueries').mockResolvedValue();
    const { result } = await renderHook(() => useDeleteLog(), { queryClient });
    await act(() => result.current.mutateAsync(1));
    expect(eq).toHaveBeenCalledWith('id', 1);
    expect(queryClient.getQueryData<LogSummary[]>(['workout-logs'])?.map((l) => l.id)).toEqual([2]);
  });
});

describe('doneOf', () => {
  it('shows what was done of the plan, or only what was done when all of it was', () => {
    expect(doneOf(7, 8)).toBe('7/8');
    expect(doneOf(8, 8)).toBe('8');
    expect(doneOf(9, 8)).toBe('9');
    expect(doneOf(5, null)).toBe('5');
  });
});

describe('byWeek', () => {
  it('starts weeks on Monday', () => {
    expect(weekStart(new Date(2026, 9, 25, 20, 0))).toEqual(new Date(2026, 9, 19));
    expect(weekStart(new Date(2026, 9, 19, 6, 0))).toEqual(new Date(2026, 9, 19));
  });

  it('groups workouts by week, latest first, with their minutes', () => {
    const weeks = byWeek([
      log(3, '2026-10-23T18:00', 52),
      log(2, '2026-10-19T18:00', 48),
      log(1, '2026-10-16T18:00', 55),
    ]);
    expect(weeks.map((week) => [week.start, week.logs.map((l) => l.id), week.minutes])).toEqual([
      [new Date(2026, 9, 19), [3, 2], 100],
      [new Date(2026, 9, 12), [1], 55],
    ]);
  });
});
