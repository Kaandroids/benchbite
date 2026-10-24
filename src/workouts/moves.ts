import { useQuery } from '@tanstack/react-query';

import { addDays, toIsoDate, weekStart } from '@/i18n/dates';
import { supabase } from '@/lib/supabase';

import type { WorkoutMove } from './week-schedule';

export const MOVES_KEY = ['workout-moves'];

/** This week's moves of the signed-in user's workouts, the week of `today` (ADR 0028). */
export function useWeekMoves(today: Date) {
  const monday = weekStart(today);
  const sunday = addDays(monday, 6);
  return useQuery({
    queryKey: [...MOVES_KEY, toIsoDate(monday)],
    queryFn: async (): Promise<WorkoutMove[]> => {
      const { data, error } = await supabase
        .from('workout_moves')
        .select('workout_id, from_on, to_on')
        .gte('from_on', toIsoDate(monday))
        .lte('from_on', toIsoDate(sunday));
      if (error) {
        throw error;
      }
      return data.map((row) => ({
        workoutId: row.workout_id,
        fromOn: row.from_on,
        toOn: row.to_on,
      }));
    },
  });
}
