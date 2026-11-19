import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';

import { LOGS_KEY } from '@/history/history';
import { reportError } from '@/lib/reporting';
import { supabase } from '@/lib/supabase';
import { RECORD_KINDS, type RecordKind } from '@/sets/records';
import { reloadMoves } from '@/workouts/moves';

import type { ExerciseBests, LastSets, SetTargets, toLog } from './session';

export const LAST_SETS_KEY = ['last-sets'];

/** The latest sets of the exercises, read again each time, as a workout may have been logged since. */
export function lastSetsQuery(exerciseIds: string[]) {
  return {
    queryKey: [...LAST_SETS_KEY, ...exerciseIds],
    queryFn: () => fetchLastSets(exerciseIds),
    staleTime: 0,
  };
}

/** The latest sets of the exercises, or none when they cannot be read: they only fill in values. */
export function fetchLastSetsOrNone(queryClient: QueryClient, exerciseIds: string[]) {
  return queryClient.fetchQuery(lastSetsQuery(exerciseIds)).catch((error: unknown): LastSets => {
    reportError('Could not load the last sets', error);
    return {};
  });
}

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

/**
 * The target of each set of the workout (set_targets(), ADR 0138): the user's own, or worked out
 * from last time; none for an exercise without, whose sets start from last time.
 */
export async function fetchSetTargets(workoutId: number): Promise<SetTargets> {
  const { data, error } = await supabase.rpc('set_targets', { workout_id: workoutId });
  if (error) {
    throw error;
  }
  const targets: SetTargets = {};
  for (const row of data) {
    // The generated types call every column of a table a function returns a number, while a set
    // of reps has no time, a timed one no reps and one done with the body's weight no weight.
    (targets[row.exercise_position] ??= { exerciseId: row.exercise_id, sets: [] }).sets[
      row.set_position
    ] = {
      weightKg: (row.weight_kg as number | null) ?? null,
      reps: (row.reps as number | null) ?? null,
      seconds: (row.seconds as number | null) ?? null,
    };
  }
  return targets;
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
    meta: { where: 'Could not log the workout' },
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
        queryClient.invalidateQueries({ queryKey: LOGS_KEY }),
        reloadMoves(queryClient),
      ]),
  });
}
