import { useMutation, useQueryClient } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';

import type { LastSets, toLog } from './session';

/** The sets of each exercise's latest log, for filling in a new workout (last_sets()). */
export async function fetchLastSets(exerciseIds: string[]): Promise<LastSets> {
  const { data, error } = await supabase.rpc('last_sets', { exercise_ids: exerciseIds });
  if (error) {
    throw error;
  }
  const sets: LastSets = {};
  for (const row of data) {
    (sets[row.exercise_id] ??= []).push({
      weightKg: row.weight_kg,
      reps: row.reps,
      seconds: row.seconds,
      meters: row.meters,
    });
  }
  return sets;
}

/** Saves a finished workout with its sets (log_workout()), and returns the log's id. */
export function useLogWorkout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (log: ReturnType<typeof toLog>) => {
      const { data, error } = await supabase.rpc('log_workout', { log });
      if (error) {
        throw error;
      }
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['workout-logs'] }),
  });
}
