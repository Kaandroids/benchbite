import { supabase } from '@/lib/supabase';
import { act, createTestQueryClient, renderHook, waitFor } from '@/test/render';

import {
  byExercise,
  byWeek,
  doneOf,
  durationMinutes,
  fetchLogSummaries,
  useDeleteLog,
  useEditLog,
  useLoggedSets,
  useLogSummary,
  useRecentLogs,
  weekStart,
  type LogSummary,
} from './history';

jest.mock('@/lib/supabase', () => ({ supabase: { from: jest.fn(), rpc: jest.fn() } }));

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
    expect(order).toHaveBeenCalledTimes(1);
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
  it('deletes the log and loads the lists again, not the log itself', async () => {
    const eq = jest.fn().mockResolvedValue({ error: null });
    jest.mocked(supabase.from).mockReturnValue({ delete: () => ({ eq }) } as never);
    const queryClient = createTestQueryClient();
    const invalidate = jest.spyOn(queryClient, 'invalidateQueries').mockResolvedValue();
    const { result } = await renderHook(() => useDeleteLog(), { queryClient });
    await act(() => result.current.mutateAsync(1));
    expect(eq).toHaveBeenCalledWith('id', 1);
    expect(invalidate.mock.calls.map(([filters]) => filters?.queryKey)).toEqual([
      ['workout-logs', 'all'],
      ['workout-logs', 'recent'],
      ['workout-logs', 'week'],
    ]);
  });
});

describe('useEditLog', () => {
  it('replaces the sets and loads every log again', async () => {
    jest.mocked(supabase.rpc).mockResolvedValue({ error: null } as never);
    const queryClient = createTestQueryClient();
    const invalidate = jest.spyOn(queryClient, 'invalidateQueries').mockResolvedValue();
    const { result } = await renderHook(() => useEditLog(), { queryClient });
    const exercises = [
      { exerciseId: 'Plank', sets: [{ weightKg: null, reps: null, seconds: 50, meters: null }] },
    ];
    await act(() => result.current.mutateAsync({ id: 7, exercises }));
    expect(supabase.rpc).toHaveBeenCalledWith('edit_workout_log', {
      log_id: 7,
      log: { exercises },
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['workout-logs'] });
  });

  it('fails when the edit is rejected', async () => {
    jest.mocked(supabase.rpc).mockResolvedValue({ error: { code: 'BB010' } } as never);
    const { result } = await renderHook(() => useEditLog());
    await act(() =>
      expect(result.current.mutateAsync({ id: 7, exercises: [] })).rejects.toEqual({
        code: 'BB010',
      }),
    );
  });
});

describe('byExercise', () => {
  const set = (exercisePosition: number, exerciseId: string, reps: number) => ({
    exercisePosition,
    exerciseId,
    weightKg: null,
    reps,
    seconds: null,
    meters: null,
  });

  it('groups the sets by exercise, keeping an exercise done twice apart', () => {
    const groups = byExercise([set(0, 'a', 1), set(0, 'a', 2), set(1, 'b', 3), set(2, 'a', 4)]);
    expect(groups.map((group) => [group.exerciseId, group.sets.map((s) => s.reps)])).toEqual([
      ['a', [1, 2]],
      ['b', [3]],
      ['a', [4]],
    ]);
  });
});

describe('useRecentLogs', () => {
  it('loads the latest logs and counts this week', async () => {
    const limit = jest.fn().mockResolvedValue({ data: [], error: null });
    const gte = jest.fn().mockResolvedValue({ count: 2, error: null });
    jest
      .mocked(supabase.from)
      .mockImplementation(
        (table: string) =>
          (table === 'workout_logs'
            ? { select: () => ({ gte }) }
            : { select: () => ({ order: () => ({ limit }) }) }) as never,
      );
    const { result } = await renderHook(() => useRecentLogs(3), {
      queryClient: createTestQueryClient(),
    });
    await waitFor(() => expect(result.current.data).toEqual({ latest: [], thisWeek: 2 }));
    expect(limit).toHaveBeenCalledWith(3);
  });
});

describe('useLogSummary', () => {
  it('loads one log, or null', async () => {
    const maybeSingle = jest.fn().mockResolvedValue({ data: null, error: null });
    const eq = jest.fn(() => ({ maybeSingle }));
    jest.mocked(supabase.from).mockReturnValue({ select: () => ({ eq }) } as never);
    const { result } = await renderHook(() => useLogSummary(9), {
      queryClient: createTestQueryClient(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
    expect(eq).toHaveBeenCalledWith('id', 9);
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
