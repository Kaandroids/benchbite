import { supabase } from '@/lib/supabase';
import { renderHook, waitFor } from '@/test/render';

import { fetchPlan, usePlan } from './use-plan';

jest.mock('@/lib/supabase', () => ({ supabase: { from: jest.fn() } }));

const select = jest.fn();

const exercise = (position: number, exerciseId: string, more: object = {}) => ({
  position,
  exercise_id: exerciseId,
  slot: 'squat',
  sets: 3,
  target_reps_min: 8,
  target_reps_max: 12,
  target_seconds: null,
  rest_seconds: 90,
  is_finisher: false,
  ...more,
});

const workout = (weekdays: number[], type: string, more: object = {}) => ({
  weekdays,
  active: true,
  type,
  estimated_minutes: 45,
  workout_exercises: [],
  ...more,
});

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(supabase.from).mockReturnValue({ select } as never);
});

describe('fetchPlan', () => {
  it('returns the sessions from Monday on, with exercises in order and the finisher apart', async () => {
    select.mockResolvedValue({
      data: [
        {
          weekdays: [4],
          active: true,
          type: 'lower',
          estimated_minutes: 45,
          workout_exercises: [
            exercise(2, 'bike', {
              slot: 'conditioning',
              target_reps_min: null,
              target_reps_max: null,
              target_seconds: 300,
              rest_seconds: 0,
              is_finisher: true,
            }),
            exercise(1, 'lunge'),
            exercise(0, 'squat'),
          ],
        },
        workout([1], 'upper', { estimated_minutes: 50 }),
      ],
      error: null,
    });
    await expect(fetchPlan()).resolves.toEqual({
      sessions: [
        { weekday: 1, type: 'upper', exercises: [], finisher: null, estimatedMinutes: 50 },
        {
          weekday: 4,
          type: 'lower',
          exercises: [
            {
              exerciseId: 'squat',
              slot: 'squat',
              sets: 3,
              target: { reps: { min: 8, max: 12 } },
              restSeconds: 90,
            },
            {
              exerciseId: 'lunge',
              slot: 'squat',
              sets: 3,
              target: { reps: { min: 8, max: 12 } },
              restSeconds: 90,
            },
          ],
          finisher: {
            exerciseId: 'bike',
            slot: 'conditioning',
            sets: 3,
            target: { seconds: 300 },
            restSeconds: 0,
          },
          estimatedMinutes: 45,
        },
      ],
    });
    expect(supabase.from).toHaveBeenCalledWith('workouts');
  });

  it('puts a workout on each of its weekdays', async () => {
    select.mockResolvedValue({ data: [workout([5, 2], 'full_body')], error: null });
    const plan = await fetchPlan();
    expect(plan?.sessions.map((session) => [session.weekday, session.type])).toEqual([
      [2, 'full_body'],
      [5, 'full_body'],
    ]);
  });

  it('leaves out inactive workouts and workouts without weekdays', async () => {
    select.mockResolvedValue({
      data: [workout([1], 'push'), workout([3], 'pull', { active: false }), workout([], 'legs')],
      error: null,
    });
    const plan = await fetchPlan();
    expect(plan?.sessions.map((session) => session.type)).toEqual(['push']);
  });

  it('is an empty week when every workout is inactive', async () => {
    select.mockResolvedValue({ data: [workout([1], 'push', { active: false })], error: null });
    await expect(fetchPlan()).resolves.toEqual({ sessions: [] });
  });

  it('returns null without workouts', async () => {
    select.mockResolvedValue({ data: [], error: null });
    await expect(fetchPlan()).resolves.toBeNull();
  });

  it('fails with the error the database returns', async () => {
    const error = { code: '42501', message: 'permission denied' };
    select.mockResolvedValue({ data: null, error });
    await expect(fetchPlan()).rejects.toBe(error);
  });
});

describe('usePlan', () => {
  it('loads the plan', async () => {
    select.mockResolvedValue({ data: [workout([], 'push')], error: null });
    const { result } = await renderHook(() => usePlan());
    await waitFor(() => expect(result.current.data).toEqual({ sessions: [] }));
  });
});
