import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';

import { TRAINING_DAYS_KEY } from '@/history/history';
import { addDays, toIsoDate, weekStart } from '@/i18n/dates';
import { supabase } from '@/lib/supabase';
import { STREAK_KEY } from '@/streak/streak';

import type { WorkoutMove } from './week-schedule';

export const MOVES_KEY = ['workout-moves'];

/**
 * Loads the moves again, and the streak and the days trained, which count a moved workout on its
 * new day.
 */
export function reloadMoves(queryClient: QueryClient) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: MOVES_KEY }),
    queryClient.invalidateQueries({ queryKey: STREAK_KEY }),
    queryClient.invalidateQueries({ queryKey: TRAINING_DAYS_KEY }),
  ]);
}

/** The query key of the moves of the week of `week`. */
export function weekMovesKey(week: Date) {
  return [...MOVES_KEY, toIsoDate(weekStart(week))];
}

/** The moves of the signed-in user's workouts from the days of the week of `week` (ADR 0028). */
export function useWeekMoves(week: Date) {
  const monday = weekStart(week);
  const sunday = addDays(monday, 6);
  return useQuery({
    queryKey: weekMovesKey(week),
    queryFn: async (): Promise<WorkoutMove[]> => {
      const { data, error } = await supabase
        .from('workout_moves')
        .select('workout_id, from_on, to_on, settled')
        .gte('from_on', toIsoDate(monday))
        .lte('from_on', toIsoDate(sunday));
      if (error) {
        throw error;
      }
      return data.map((row) => ({
        workoutId: row.workout_id,
        fromOn: row.from_on,
        toOn: row.to_on,
        settled: row.settled,
      }));
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
    mutationFn: async ({ workoutId, fromOn, toOn }: Omit<WorkoutMove, 'settled'>) => {
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
    onSettled: () => reloadMoves(queryClient),
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
    onSettled: () => reloadMoves(queryClient),
  });
}
