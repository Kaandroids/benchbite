import { useQuery } from '@tanstack/react-query';

import { addDays, fromIsoDate, isoWeekday, toIsoDate, weekStart } from '@/i18n/dates';
import type { Database } from '@/lib/database.types';
import { supabase } from '@/lib/supabase';

import { sessionOf, WORKOUTS_KEY, type WeekSession, type Workout } from './workouts';

/** A workout planned on a day, as the database keeps or plans it (ADR 0041). */
export type PlannedDay = {
  /** YYYY-MM-DD. */
  day: string;
  workoutId: number;
  name: string | null;
  type: Database['public']['Enums']['workout_type'] | null;
};

/** The planned days of the week of `today`; under the workouts, so changing them reloads it. */
export const plannedWeekKey = (today: Date) => [
  ...WORKOUTS_KEY,
  'planned',
  toIsoDate(weekStart(today)),
];

/**
 * The workouts planned on each day of the week of `today`: past days as they kept them, today and
 * later by the plan. The device says which day is today.
 */
export function usePlannedWeek(today: Date) {
  const monday = weekStart(today);
  return useQuery({
    queryKey: plannedWeekKey(today),
    queryFn: async (): Promise<PlannedDay[]> => {
      const { data, error } = await supabase.rpc('planned_workouts', {
        from_day: toIsoDate(monday),
        to_day: toIsoDate(addDays(monday, 6)),
        today: toIsoDate(today),
      });
      if (error) {
        throw error;
      }
      return data.map((row) => ({
        day: row.day,
        workoutId: row.workout_id,
        name: row.name,
        type: row.type,
      }));
    },
  });
}

/**
 * The week's sessions on their days: each planned workout with what it holds now, or, for one that
 * left the plan since, the name and type its day kept.
 */
export function plannedSessions(planned: readonly PlannedDay[], workouts: readonly Workout[]) {
  return planned.map((row): WeekSession => {
    const workout = workouts.find((item) => item.id === row.workoutId);
    const weekday = isoWeekday(fromIsoDate(row.day));
    if (workout?.active) {
      return { ...sessionOf(workout, weekday), on: row.day };
    }
    return {
      weekday,
      on: row.day,
      workoutId: row.workoutId,
      name: row.name,
      type: row.type,
      exercises: workout?.exercises ?? [],
      estimatedMinutes: workout?.estimatedMinutes ?? 0,
      gone: true,
      deleted: workout === undefined,
    };
  });
}
