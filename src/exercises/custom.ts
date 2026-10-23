import { useMutation, useQueryClient } from '@tanstack/react-query';

import type { Database } from '@/lib/database.types';
import { supabase } from '@/lib/supabase';

import type { LibraryExercise } from './library';

type Enums = Database['public']['Enums'];

/** The ways a custom exercise can be logged, as the database allows them (ADR 0008, 0026). */
export const LOG_KINDS = {
  weightReps: ['weight', 'reps'],
  reps: ['reps'],
  time: ['duration'],
  distanceTime: ['distance', 'duration'],
} as const satisfies Record<string, Enums['exercise_metric'][]>;

export type LogKind = keyof typeof LOG_KINDS;

/** What the user fills in for a custom exercise. */
export type CustomExerciseForm = {
  name: string;
  logKind: LogKind | null;
  primaryMuscles: Enums['muscle'][];
  secondaryMuscles: Enums['muscle'][];
  equipment: Enums['equipment'] | null;
  level: Enums['exercise_level'];
  instructions: string[];
};

export const emptyForm = (name = ''): CustomExerciseForm => ({
  name,
  logKind: null,
  primaryMuscles: [],
  secondaryMuscles: [],
  equipment: null,
  level: 'beginner',
  instructions: [],
});

/** Whether the form has what an exercise needs: a name, a way of logging and a main muscle. */
export function isComplete(form: CustomExerciseForm): boolean {
  return form.name.trim() !== '' && form.logKind !== null && form.primaryMuscles.length > 0;
}

/** The exercise as create_exercise() takes it. */
export function toExercise(form: CustomExerciseForm) {
  return {
    name: form.name.trim(),
    metrics: form.logKind ? [...LOG_KINDS[form.logKind]] : [],
    primaryMuscles: form.primaryMuscles,
    secondaryMuscles: form.secondaryMuscles.filter(
      (muscle) => !form.primaryMuscles.includes(muscle),
    ),
    equipment: form.equipment,
    level: form.level,
    instructions: form.instructions.map((step) => step.trim()).filter(Boolean),
  };
}

/**
 * Creates a custom exercise and loads the library again. Resolves to the exercise as the picker
 * lists it, so that it can be chosen straight away.
 */
export function useCreateExercise() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (form: CustomExerciseForm): Promise<LibraryExercise> => {
      const exercise = toExercise(form);
      const { data: id, error } = await supabase.rpc('create_exercise', { exercise });
      if (error) {
        throw error;
      }
      return {
        id,
        name: exercise.name,
        searchText: exercise.name.toLowerCase(),
        metrics: exercise.metrics,
        primaryMuscles: exercise.primaryMuscles,
        secondaryMuscles: exercise.secondaryMuscles,
        equipment: exercise.equipment,
        level: exercise.level,
        category: exercise.metrics.includes('distance') ? 'cardio' : 'strength',
        imagePaths: [],
        custom: true,
        archived: false,
      };
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['exercises'] }),
  });
}

// The exercise created last from the picker, which the picker adds to its choice when it shows
// again. The create screen is a screen of its own, so it hands the exercise back this way.
let created: LibraryExercise | null = null;

export function setCreatedExercise(exercise: LibraryExercise) {
  created = exercise;
}

/** The exercise created since the picker last asked, once. */
export function takeCreatedExercise(): LibraryExercise | null {
  const exercise = created;
  created = null;
  return exercise;
}
