import { supabase } from '@/lib/supabase';
import { act, createTestQueryClient, renderHook, waitFor } from '@/test/render';

import {
  fetchWorkouts,
  useSetWorkoutActive,
  useWeek,
  useWorkouts,
  weekOf,
  type Workout,
} from './workouts';

jest.mock('@/lib/supabase', () => ({ supabase: { from: jest.fn() } }));

const order = jest.fn();
const select = jest.fn(() => ({ order }));
const eq = jest.fn();
const update = jest.fn(() => ({ eq }));

const exerciseRow = (position: number, exerciseId: string, more: object = {}) => ({
  position,
  exercise_id: exerciseId,
  slot: 'squat',
  sets: 3,
  target_reps_min: 8,
  target_reps_max: 12,
  target_seconds: null,
  target_meters: null,
  rest_seconds: 90,
  is_finisher: false,
  exercises: { primary_muscles: ['quadriceps'], image_paths: [`${exerciseId}/0.webp`] },
  ...more,
});

const row = (id: number, weekdays: number[], more: object = {}) => ({
  id,
  name: null,
  weekdays,
  active: true,
  type: 'full_body',
  estimated_minutes: 45,
  workout_exercises: [],
  ...more,
});

const workout = (id: number, weekdays: number[], active = true): Workout => ({
  id,
  name: null,
  type: 'full_body',
  weekdays,
  active,
  estimatedMinutes: 45,
  exercises: [],
  finisher: null,
});

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(supabase.from).mockReturnValue({ select, update } as never);
});

describe('fetchWorkouts', () => {
  it('returns the workouts with their exercises in order and the finisher apart', async () => {
    order.mockResolvedValue({
      data: [
        row(4, [5, 2], {
          type: 'lower',
          workout_exercises: [
            exerciseRow(2, 'bike', {
              slot: 'conditioning',
              target_reps_min: null,
              target_reps_max: null,
              target_seconds: 300,
              rest_seconds: 0,
              is_finisher: true,
              exercises: { primary_muscles: ['quadriceps'], image_paths: [] },
            }),
            exerciseRow(1, 'lunge', {
              exercises: { primary_muscles: ['glutes'], image_paths: ['lunge/0.webp'] },
            }),
            exerciseRow(0, 'squat'),
          ],
        }),
      ],
      error: null,
    });
    const [lower] = await fetchWorkouts();
    expect(lower).toEqual({
      id: 4,
      name: null,
      type: 'lower',
      weekdays: [2, 5],
      active: true,
      estimatedMinutes: 45,
      exercises: [
        {
          exerciseId: 'squat',
          sets: 3,
          target: { reps: { min: 8, max: 12 } },
          restSeconds: 90,
          primaryMuscles: ['quadriceps'],
          imagePath: 'squat/0.webp',
        },
        {
          exerciseId: 'lunge',
          sets: 3,
          target: { reps: { min: 8, max: 12 } },
          restSeconds: 90,
          primaryMuscles: ['glutes'],
          imagePath: 'lunge/0.webp',
        },
      ],
      finisher: {
        exerciseId: 'bike',
        sets: 3,
        target: { seconds: 300, meters: null },
        restSeconds: 0,
        primaryMuscles: ['quadriceps'],
        imagePath: null,
      },
    });
    expect(supabase.from).toHaveBeenCalledWith('workouts');
    expect(order).toHaveBeenCalledWith('id');
  });

  it('fails with the error the database returns', async () => {
    const error = { code: '42501', message: 'permission denied' };
    order.mockResolvedValue({ data: null, error });
    await expect(fetchWorkouts()).rejects.toBe(error);
  });
});

describe('weekOf', () => {
  it('puts each active workout on its weekdays, from Monday on', () => {
    const week = weekOf([workout(1, [5, 2]), workout(2, [1])]);
    expect(week.sessions.map((session) => [session.weekday, session.workoutId])).toEqual([
      [1, 2],
      [2, 1],
      [5, 1],
    ]);
  });

  it('leaves out inactive workouts and workouts without weekdays', () => {
    const week = weekOf([workout(1, [1], false), workout(2, []), workout(3, [3])]);
    expect(week.sessions.map((session) => session.workoutId)).toEqual([3]);
  });
});

describe('useWeek', () => {
  it('is null without workouts', async () => {
    order.mockResolvedValue({ data: [], error: null });
    const { result } = await renderHook(() => useWeek());
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
  });

  it('is the week of the workouts', async () => {
    order.mockResolvedValue({ data: [row(1, [3])], error: null });
    const { result } = await renderHook(() => useWeek());
    await waitFor(() => expect(result.current.data?.sessions).toHaveLength(1));
  });
});

describe('useSetWorkoutActive', () => {
  it('switches the workout at once and saves it', async () => {
    order.mockResolvedValue({ data: [row(1, [1]), row(2, [3])], error: null });
    eq.mockResolvedValue({ error: null });
    const queryClient = createTestQueryClient();
    const { result } = await renderHook(
      () => ({ workouts: useWorkouts(), setActive: useSetWorkoutActive() }),
      { queryClient },
    );
    await waitFor(() => expect(result.current.workouts.data).toHaveLength(2));
    order.mockResolvedValue({ data: [row(1, [1], { active: false }), row(2, [3])], error: null });
    await act(() => result.current.setActive.mutateAsync({ id: 1, active: false }));
    expect(update).toHaveBeenCalledWith({ active: false });
    expect(eq).toHaveBeenCalledWith('id', 1);
    expect(result.current.workouts.data?.map((item) => item.active)).toEqual([false, true]);
  });

  it('puts the workout back if saving fails', async () => {
    order.mockResolvedValue({ data: [row(1, [1])], error: null });
    eq.mockResolvedValue({ error: { code: '42501', message: 'permission denied' } });
    const { result } = await renderHook(() => ({
      workouts: useWorkouts(),
      setActive: useSetWorkoutActive(),
    }));
    await waitFor(() => expect(result.current.workouts.data).toHaveLength(1));
    await act(() =>
      result.current.setActive.mutateAsync({ id: 1, active: false }).catch(() => undefined),
    );
    await waitFor(() => expect(result.current.workouts.data?.[0]?.active).toBe(true));
  });
});
