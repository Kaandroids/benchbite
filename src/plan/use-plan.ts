import { useQuery } from '@tanstack/react-query';

import type { Database } from '@/lib/database.types';
import { supabase } from '@/lib/supabase';
import type { Plan, PlannedExercise, Session } from '@shared/plan/types';

type ExerciseRow = Pick<
  Database['public']['Tables']['workout_exercises']['Row'],
  | 'position'
  | 'exercise_id'
  | 'slot'
  | 'sets'
  | 'target_reps_min'
  | 'target_reps_max'
  | 'target_seconds'
  | 'rest_seconds'
  | 'is_finisher'
>;

function plannedExercise(row: ExerciseRow): PlannedExercise {
  return {
    exerciseId: row.exercise_id,
    slot: row.slot,
    sets: row.sets,
    // The table allows either a time or a rep range, never both.
    target:
      row.target_seconds !== null
        ? { seconds: row.target_seconds }
        : { reps: { min: row.target_reps_min ?? 0, max: row.target_reps_max ?? 0 } },
    restSeconds: row.rest_seconds,
  };
}

/**
 * The user's week from their active workouts, in the shape the plan builder returns: a session for
 * each weekday a workout is on, from Monday on. Workouts without weekdays are left out, as they
 * are not planned for a day. Null if the user has no workouts at all.
 */
export async function fetchPlan(): Promise<Plan | null> {
  const { data, error } = await supabase.from('workouts').select(
    `weekdays, active, type, estimated_minutes,
      workout_exercises (
        position, exercise_id, slot, sets, target_reps_min, target_reps_max, target_seconds,
        rest_seconds, is_finisher
      )`,
  );
  if (error) {
    throw error;
  }
  if (data.length === 0) {
    return null;
  }
  const sessions: Session[] = data
    .filter((workout) => workout.active)
    .flatMap((workout) => {
      const rows = [...workout.workout_exercises].sort((a, b) => a.position - b.position);
      const finisher = rows.find((row) => row.is_finisher);
      return workout.weekdays.map((weekday) => ({
        weekday,
        type: workout.type,
        exercises: rows.filter((row) => !row.is_finisher).map(plannedExercise),
        finisher: finisher ? plannedExercise(finisher) : null,
        estimatedMinutes: workout.estimated_minutes,
      }));
    })
    .sort((a, b) => a.weekday - b.weekday);
  return { sessions };
}

/** The signed-in user's week of workouts, or null if they have none. */
export function usePlan() {
  return useQuery({ queryKey: ['plan'], queryFn: fetchPlan });
}
