import { useQuery } from '@tanstack/react-query';

import type { Database } from '@/lib/database.types';
import { supabase } from '@/lib/supabase';
import type { Plan, PlannedExercise, Session } from '@shared/plan/types';

type ExerciseRow = Pick<
  Database['public']['Tables']['plan_exercises']['Row'],
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

/** The saved plan in the shape the plan builder returned it, sessions from Monday on. */
export async function fetchPlan(): Promise<Plan | null> {
  const { data, error } = await supabase
    .from('workout_plans')
    .select(
      `plan_sessions (
        weekday, type, estimated_minutes,
        plan_exercises (
          position, exercise_id, slot, sets, target_reps_min, target_reps_max, target_seconds,
          rest_seconds, is_finisher
        )
      )`,
    )
    .maybeSingle();
  if (error) {
    throw error;
  }
  if (!data) {
    return null;
  }
  const sessions: Session[] = data.plan_sessions
    .map((session) => {
      const rows = [...session.plan_exercises].sort((a, b) => a.position - b.position);
      const finisher = rows.find((row) => row.is_finisher);
      return {
        weekday: session.weekday,
        type: session.type,
        exercises: rows.filter((row) => !row.is_finisher).map(plannedExercise),
        finisher: finisher ? plannedExercise(finisher) : null,
        estimatedMinutes: session.estimated_minutes,
      };
    })
    .sort((a, b) => a.weekday - b.weekday);
  return { sessions };
}

/** The signed-in user's workout plan, or null if they have none. */
export function usePlan() {
  return useQuery({ queryKey: ['plan'], queryFn: fetchPlan });
}
