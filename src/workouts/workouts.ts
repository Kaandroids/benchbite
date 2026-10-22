import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { Database } from '@/lib/database.types';
import { supabase } from '@/lib/supabase';
import type { PlannedExercise, Session } from '@shared/plan/types';

type Enums = Database['public']['Enums'];
export type Muscle = Enums['muscle'];

export type WorkoutExercise = PlannedExercise & {
  primaryMuscles: Muscle[];
  /** The first picture of the exercise, as a path in the exercise-images bucket. */
  imagePath: string | null;
};

export type Workout = {
  id: number;
  type: Enums['workout_type'];
  /** ISO weekdays, 1 for Monday to 7 for Sunday, from Monday on; empty for any day. */
  weekdays: number[];
  active: boolean;
  estimatedMinutes: number;
  exercises: WorkoutExercise[];
  finisher: WorkoutExercise | null;
};

/** A workout on one day of the week, in the shape the plan builder returns sessions. */
export type WeekSession = Session & { workoutId: number };

const WORKOUTS_KEY = ['workouts'];

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
> & {
  exercises: Pick<
    Database['public']['Tables']['exercises']['Row'],
    'primary_muscles' | 'image_paths'
  >;
};

function workoutExercise(row: ExerciseRow): WorkoutExercise {
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
    primaryMuscles: row.exercises.primary_muscles,
    imagePath: row.exercises.image_paths[0] ?? null,
  };
}

/** The signed-in user's workouts, oldest first, each with its exercises in order. */
export async function fetchWorkouts(): Promise<Workout[]> {
  const { data, error } = await supabase
    .from('workouts')
    .select(
      `id, weekdays, active, type, estimated_minutes,
      workout_exercises (
        position, exercise_id, slot, sets, target_reps_min, target_reps_max, target_seconds,
        rest_seconds, is_finisher,
        exercises (primary_muscles, image_paths)
      )`,
    )
    .order('id');
  if (error) {
    throw error;
  }
  return data.map((row) => {
    const rows = [...row.workout_exercises].sort((a, b) => a.position - b.position);
    const finisher = rows.find((exercise) => exercise.is_finisher);
    return {
      id: row.id,
      type: row.type,
      weekdays: [...row.weekdays].sort((a, b) => a - b),
      active: row.active,
      estimatedMinutes: row.estimated_minutes,
      exercises: rows.filter((exercise) => !exercise.is_finisher).map(workoutExercise),
      finisher: finisher ? workoutExercise(finisher) : null,
    };
  });
}

/**
 * The week from the active workouts: a session for each weekday a workout is on, from Monday on.
 * Workouts without weekdays are left out, as they are not planned for a day.
 */
export function weekOf(workouts: Workout[]): { sessions: WeekSession[] } {
  const sessions = workouts
    .filter((workout) => workout.active)
    .flatMap((workout) =>
      workout.weekdays.map((weekday) => ({
        weekday,
        workoutId: workout.id,
        type: workout.type,
        exercises: workout.exercises,
        finisher: workout.finisher,
        estimatedMinutes: workout.estimatedMinutes,
      })),
    )
    .sort((a, b) => a.weekday - b.weekday);
  return { sessions };
}

export function useWorkouts() {
  return useQuery({ queryKey: WORKOUTS_KEY, queryFn: fetchWorkouts });
}

/** The week of the signed-in user, or null if they have no workouts at all. */
export function useWeek() {
  return useQuery({
    queryKey: WORKOUTS_KEY,
    queryFn: fetchWorkouts,
    select: (workouts) => (workouts.length > 0 ? weekOf(workouts) : null),
  });
}

/** Switches a workout on or off. The list changes at once and is put back if saving fails. */
export function useSetWorkoutActive() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, active }: { id: number; active: boolean }) => {
      const { error } = await supabase.from('workouts').update({ active }).eq('id', id);
      if (error) {
        throw error;
      }
    },
    onMutate: async ({ id, active }) => {
      await queryClient.cancelQueries({ queryKey: WORKOUTS_KEY });
      const previous = queryClient.getQueryData<Workout[]>(WORKOUTS_KEY);
      queryClient.setQueryData<Workout[]>(WORKOUTS_KEY, (workouts) =>
        workouts?.map((workout) => (workout.id === id ? { ...workout, active } : workout)),
      );
      return { previous };
    },
    onError: (_error, _variables, context) => {
      queryClient.setQueryData(WORKOUTS_KEY, context?.previous);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: WORKOUTS_KEY }),
  });
}

/** The URL of an exercise picture in the public exercise-images bucket. */
export function exerciseImageUrl(path: string): string {
  return supabase.storage.from('exercise-images').getPublicUrl(path).data.publicUrl;
}
