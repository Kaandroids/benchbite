import { supabase } from '@/lib/supabase';
import { act, createTestQueryClient, renderHook } from '@/test/render';

import { fetchLastSets, useLogWorkout } from './logs';

jest.mock('@/lib/supabase', () => ({ supabase: { rpc: jest.fn() } }));

const row = (exerciseId: string, more: object) => ({
  exercise_id: exerciseId,
  weight_kg: null,
  reps: null,
  seconds: null,
  meters: null,
  ...more,
});

beforeEach(() => jest.clearAllMocks());

describe('fetchLastSets', () => {
  it('groups the latest sets by exercise, in order', async () => {
    jest.mocked(supabase.rpc).mockResolvedValue({
      data: [
        row('bench', { weight_kg: 80, reps: 8 }),
        row('bench', { weight_kg: 80, reps: 7 }),
        row('plank', { seconds: 50 }),
      ],
      error: null,
    } as never);
    await expect(fetchLastSets(['bench', 'plank', 'curl'])).resolves.toEqual({
      bench: [
        { weightKg: 80, reps: 8, seconds: null, meters: null },
        { weightKg: 80, reps: 7, seconds: null, meters: null },
      ],
      plank: [{ weightKg: null, reps: null, seconds: 50, meters: null }],
    });
    expect(supabase.rpc).toHaveBeenCalledWith('last_sets', {
      exercise_ids: ['bench', 'plank', 'curl'],
    });
  });

  it('fails with the error the database returns', async () => {
    const error = { code: '500', message: 'boom' };
    jest.mocked(supabase.rpc).mockResolvedValue({ data: null, error } as never);
    await expect(fetchLastSets(['bench'])).rejects.toBe(error);
  });
});

describe('useLogWorkout', () => {
  it('saves the log and returns its id', async () => {
    jest.mocked(supabase.rpc).mockResolvedValue({ data: 12, error: null } as never);
    const log = {
      workoutId: 7,
      plannedExercises: 1,
      plannedSets: 3,
      startedAt: 'a',
      finishedAt: 'b',
      exercises: [],
    };
    const { result } = await renderHook(() => useLogWorkout(), {
      queryClient: createTestQueryClient(),
    });
    await act(async () => {
      await expect(result.current.mutateAsync(log)).resolves.toBe(12);
    });
    expect(supabase.rpc).toHaveBeenCalledWith('log_workout', { log });
  });
});
