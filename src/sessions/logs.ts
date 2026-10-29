import { useMutation, useQueryClient } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';
import { RECORD_KINDS, type RecordKind } from '@/sets/records';
import { MOVES_KEY } from '@/workouts/moves';
import { STREAK_KEY } from '@/streak/streak';

import type { ExerciseBests, LastSets, toLog } from './session';

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

/** Each exercise's records before a workout, for noticing new ones while logging (exercise_bests()). */
export async function fetchBests(exerciseIds: string[]): Promise<ExerciseBests> {
  const { data, error } = await supabase.rpc('exercise_bests', { exercise_ids: exerciseIds });
  if (error) {
    throw error;
  }
  const bests: ExerciseBests = {};
  for (const row of data) {
    if ((RECORD_KINDS as readonly string[]).includes(row.kind)) {
      (bests[row.exercise_id] ??= {})[row.kind as RecordKind] = Number(row.value);
    }
  }
  return bests;
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
    // A log can bring a move with it, and count its day for the streak.
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ['workout-logs'] }),
        queryClient.invalidateQueries({ queryKey: MOVES_KEY }),
        queryClient.invalidateQueries({ queryKey: STREAK_KEY }),
      ]),
  });
}
