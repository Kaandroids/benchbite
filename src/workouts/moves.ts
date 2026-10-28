import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { addDays, toIsoDate, weekStart } from '@/i18n/dates';
import { supabase } from '@/lib/supabase';

import type { WorkoutMove } from './week-schedule';

export const MOVES_KEY = ['workout-moves'];

/** The query key of the moves of the week of `today`. */
export function weekMovesKey(today: Date) {
  return [...MOVES_KEY, toIsoDate(weekStart(today))];
}

/** This week's moves of the signed-in user's workouts, the week of `today` (ADR 0028). */
export function useWeekMoves(today: Date) {
  const monday = weekStart(today);
  const sunday = addDays(monday, 6);
  return useQuery({
    queryKey: weekMovesKey(today),
    queryFn: async (): Promise<WorkoutMove[]> => {
      const { data, error } = await supabase
        .from('workout_moves')
        .select('workout_id, from_on, to_on')
        .gte('from_on', toIsoDate(monday))
        .lte('from_on', toIsoDate(sunday));
      if (error) {
        throw error;
      }
      // A deleted workout's moves stay with its kept days (ADR 0041); the week leaves them out
      // until it reads those days.
      return data.flatMap((row) =>
        row.workout_id === null
          ? []
          : [{ workoutId: row.workout_id, fromOn: row.from_on, toOn: row.to_on }],
      );
    },
  });
}

/**
 * Moves a workout from one of its days to another day of the same week, or skips it there. The
 * database checks the move against the plan and refuses one that does not fit with BB019.
 */
export function useMoveWorkout() {
  const queryClient = useQueryClient();
  return useMutation({
    // One move at a time, so that on a slow connection an earlier move cannot land last.
    scope: { id: 'workout-moves' },
    mutationFn: async ({ workoutId, fromOn, toOn }: WorkoutMove) => {
      const { error } = await supabase.rpc('move_workout', {
        workout_id: workoutId,
        from_on: fromOn,
        // The generated types do not know that the day may be null, for a skip.
        to_on: toOn as string,
      });
      if (error) {
        throw error;
      }
    },
    // A refused move means the week changed elsewhere, so it is loaded again either way.
    onSettled: () => queryClient.invalidateQueries({ queryKey: MOVES_KEY }),
  });
}

/** Undoes a move or a skip, so the workout is back on its own day. */
export function useUndoMove() {
  const queryClient = useQueryClient();
  return useMutation({
    scope: { id: 'workout-moves' },
    mutationFn: async ({ workoutId, fromOn }: Pick<WorkoutMove, 'workoutId' | 'fromOn'>) => {
      const { error } = await supabase
        .from('workout_moves')
        .delete()
        .eq('workout_id', workoutId)
        .eq('from_on', fromOn);
      if (error) {
        throw error;
      }
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: MOVES_KEY }),
  });
}
