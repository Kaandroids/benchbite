import { supabase } from '@/lib/supabase';
import { renderHook, waitFor } from '@/test/render';

import { fetchPlan, usePlan } from './use-plan';

jest.mock('@/lib/supabase', () => ({ supabase: { from: jest.fn() } }));

const maybeSingle = jest.fn();
const select = jest.fn(() => ({ maybeSingle }));

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

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(supabase.from).mockReturnValue({ select } as never);
});

describe('fetchPlan', () => {
  it('returns the sessions from Monday on, with exercises in order and the finisher apart', async () => {
    maybeSingle.mockResolvedValue({
      data: {
        plan_sessions: [
          {
            weekday: 4,
            type: 'lower',
            estimated_minutes: 45,
            plan_exercises: [
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
          { weekday: 1, type: 'upper', estimated_minutes: 50, plan_exercises: [] },
        ],
      },
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
    expect(supabase.from).toHaveBeenCalledWith('workout_plans');
  });

  it('returns null without a plan', async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null });
    await expect(fetchPlan()).resolves.toBeNull();
  });

  it('fails with the error the database returns', async () => {
    const error = { code: '42501', message: 'permission denied' };
    maybeSingle.mockResolvedValue({ data: null, error });
    await expect(fetchPlan()).rejects.toBe(error);
  });
});

describe('usePlan', () => {
  it('loads the plan', async () => {
    maybeSingle.mockResolvedValue({ data: { plan_sessions: [] }, error: null });
    const { result } = await renderHook(() => usePlan());
    await waitFor(() => expect(result.current.data).toEqual({ sessions: [] }));
  });
});
