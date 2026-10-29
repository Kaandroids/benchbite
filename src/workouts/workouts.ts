import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';

import { deviceToday } from '@/i18n/dates';
import type { Database } from '@/lib/database.types';
import { supabase } from '@/lib/supabase';
import { STREAK_KEY } from '@/streak/streak';

import { MOVES_KEY } from './moves';

type Enums = Database['public']['Enums'];
export type Muscle = Enums['muscle'];

/** A rep range, or a time, a distance or both. */
export type WorkoutTarget =
  { reps: { min: number; max: number } } | { seconds: number | null; meters: number | null };

export type WorkoutExercise = {
  exerciseId: string;
  sets: number;
  target: WorkoutTarget;
  restSeconds: number;
  primaryMuscles: Muscle[];
  /** The first picture of the exercise, as a path in the exercise-images bucket. */
  imagePath: string | null;
};

export type Workout = {
  id: number;
  /** The name given by the user; workouts from the onboarding are named after their type. */
  name: string | null;
  type: Enums['workout_type'] | null;
  /** ISO weekdays, 1 for Monday to 7 for Sunday, from Monday on; empty for any day. */
  weekdays: number[];
  active: boolean;
  estimatedMinutes: number;
  exercises: WorkoutExercise[];
};

/** A workout as a session on a weekday. */
export function sessionOf(workout: Workout, weekday: number): WeekSession {
  return {
    weekday,
    workoutId: workout.id,
    name: workout.name,
    type: workout.type,
    exercises: workout.exercises,
    estimatedMinutes: workout.estimatedMinutes,
  };
}

/** A workout on one day of the week. */
export type WeekSession = Pick<Workout, 'name' | 'type' | 'exercises' | 'estimatedMinutes'> & {
  weekday: number;
  workoutId: number;
  /** The one day it is planned on, YYYY-MM-DD, as a kept day (ADR 0041); without it, every week. */
  on?: string;
  /**
   * How the workout left the plan since, if it did: shown, but not started, moved or undone. A
   * deleted one's logs no longer say which workout they were.
   */
  left?: 'archived' | 'deleted';
};

export const WORKOUTS_KEY = ['workouts'];

type ExerciseRow = Pick<
  Database['public']['Tables']['workout_exercises']['Row'],
  | 'position'
  | 'exercise_id'
  | 'sets'
  | 'target_reps_min'
  | 'target_reps_max'
  | 'target_seconds'
  | 'target_meters'
  | 'rest_seconds'
> & {
  exercises: Pick<
    Database['public']['Tables']['exercises']['Row'],
    'primary_muscles' | 'image_paths'
  >;
};

function workoutExercise(row: ExerciseRow): WorkoutExercise {
  return {
    exerciseId: row.exercise_id,
    sets: row.sets,
    // The table allows either a rep range, or a time and a distance, one of which may be missing.
    target:
      row.target_reps_min !== null
        ? { reps: { min: row.target_reps_min, max: row.target_reps_max ?? row.target_reps_min } }
        : { seconds: row.target_seconds, meters: row.target_meters },
    restSeconds: row.rest_seconds,
    primaryMuscles: row.exercises.primary_muscles,
    imagePath: row.exercises.image_paths.find((path) => path !== null) ?? null,
  };
}

/** The signed-in user's workouts, oldest first, each with its exercises in order. */
export async function fetchWorkouts(): Promise<Workout[]> {
  const { data, error } = await supabase
    .from('workouts')
    .select(
      `id, name, weekdays, active, type, estimated_minutes,
      workout_exercises (
        position, exercise_id, sets, target_reps_min, target_reps_max, target_seconds,
        target_meters, rest_seconds,
        exercises (primary_muscles, image_paths)
      )`,
    )
    .order('id');
  if (error) {
    throw error;
  }
  return data.map((row) => {
    const rows = [...row.workout_exercises].sort((a, b) => a.position - b.position);
    return {
      id: row.id,
      name: row.name,
      type: row.type,
      weekdays: [...row.weekdays].sort((a, b) => a - b),
      active: row.active,
      estimatedMinutes: row.estimated_minutes,
      exercises: rows.map(workoutExercise),
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
    .flatMap((workout) => workout.weekdays.map((weekday) => sessionOf(workout, weekday)))
    .sort((a, b) => a.weekday - b.weekday);
  return { sessions };
}

/**
 * Loads the plan again after it changed: the workouts, with the planned days under them, and the
 * moves, which the database settles when a workout changes (ADR 0041), and the streak.
 */
function reloadPlan(queryClient: QueryClient) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: WORKOUTS_KEY }),
    queryClient.invalidateQueries({ queryKey: MOVES_KEY }),
    queryClient.invalidateQueries({ queryKey: STREAK_KEY }),
  ]);
}

export function useWorkouts() {
  return useQuery({ queryKey: WORKOUTS_KEY, queryFn: fetchWorkouts });
}

/** A workout by its id; undefined while the workouts load or without one. */
export function findWorkout(
  workouts: readonly Workout[] | undefined,
  id: number | null | undefined,
): Workout | undefined {
  return workouts?.find((workout) => workout.id === id);
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
      // With the device's today, as every change to the plan, so that the days before it keep
      // the plan they had (ADR 0041).
      const { error } = await supabase.rpc('set_workout_active', {
        workout_id: id,
        active,
        today: deviceToday(),
      });
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
    onSettled: () => reloadPlan(queryClient),
  });
}

/** A workout as the editor builds it: without an id until it is first saved. */
export type WorkoutDraft = {
  id?: number;
  /** Null keeps the plan builder's type as the name, in whatever language the app is in. */
  name: string | null;
  weekdays: number[];
  exercises: Pick<WorkoutExercise, 'exerciseId' | 'sets' | 'target' | 'restSeconds'>[];
};

/**
 * The calories the user burns in a minute of strength training at their latest weight, for
 * estimating a workout; null without a weight.
 */
export function useKcalPerMinute() {
  return useQuery({
    // Under the weights, so that a new weight updates it.
    queryKey: ['weights', 'kcal-per-minute'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('my_strength_kcal_per_minute');
      if (error) {
        throw error;
      }
      return data === null ? null : Number(data);
    },
  });
}

/** How many workouts the user may have, and how many exercises each, which premium will raise (ADR 0018). */
export function useWorkoutLimits() {
  return useQuery({
    queryKey: ['workout-limits'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('workout_limits').single();
      if (error) {
        throw error;
      }
      return data;
    },
    staleTime: Infinity,
  });
}

/** Saves a new or changed workout with its exercises, and returns its id. */
export function useSaveWorkout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (draft: WorkoutDraft) => {
      const { data, error } = await supabase.rpc('save_workout', {
        workout: draft,
        today: deviceToday(),
      });
      if (error) {
        throw error;
      }
      return data;
    },
    onSuccess: () => reloadPlan(queryClient),
  });
}

/** Deletes a workout with its exercises. */
export function useDeleteWorkout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const { error } = await supabase.rpc('delete_workout', {
        workout_id: id,
        today: deviceToday(),
      });
      if (error) {
        throw error;
      }
    },
    // Removed from the list at once, without waiting for the refetch, so the screens can close.
    onSuccess: (_data, id) => {
      queryClient.setQueryData<Workout[]>(WORKOUTS_KEY, (workouts) =>
        workouts?.filter((workout) => workout.id !== id),
      );
      void reloadPlan(queryClient);
    },
  });
}
