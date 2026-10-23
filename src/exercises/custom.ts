import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { Database } from '@/lib/database.types';
import { supabase } from '@/lib/supabase';

import type { LibraryExercise } from './library';
import { isUserPhoto, removePhotos, uploadPhoto } from './photos';

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
  /**
   * The photos of the start and the end of a rep: local URIs until they are uploaded, or the paths
   * of photos the exercise already has.
   */
  photos: [string | null, string | null];
};

export const emptyForm = (name = ''): CustomExerciseForm => ({
  name,
  logKind: null,
  primaryMuscles: [],
  secondaryMuscles: [],
  equipment: null,
  level: 'beginner',
  instructions: [],
  photos: [null, null],
});

/** The form of an exercise that exists, for editing it. */
export function formOf(exercise: LibraryExercise, instructions: string[]): CustomExerciseForm {
  const kind = (Object.keys(LOG_KINDS) as LogKind[]).find(
    (key) => LOG_KINDS[key].join() === exercise.metrics.join(),
  );
  return {
    name: exercise.name,
    logKind: kind ?? null,
    primaryMuscles: exercise.primaryMuscles,
    secondaryMuscles: exercise.secondaryMuscles,
    equipment: exercise.equipment,
    level: exercise.level,
    instructions,
    photos: [exercise.imagePaths[0] ?? null, exercise.imagePaths[1] ?? null],
  };
}

/** Uploads the form's new photos and resolves to the paths of all of them, in order. */
async function photoPaths(form: CustomExerciseForm): Promise<string[]> {
  const photos = form.photos.filter((photo): photo is string => photo !== null);
  return Promise.all(photos.map((photo) => (isUserPhoto(photo) ? photo : uploadPhoto(photo))));
}

/** Whether the form has what an exercise needs: a name, a way of logging and a main muscle. */
export function isComplete(form: CustomExerciseForm): boolean {
  return form.name.trim() !== '' && form.logKind !== null && form.primaryMuscles.length > 0;
}

/** The exercise as create_exercise() takes it, with the paths of its uploaded photos. */
export function toExercise(form: CustomExerciseForm, imagePaths: string[] = []) {
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
    imagePaths,
  };
}

/**
 * Uploads the photos, then creates a custom exercise naming them, and loads the library again.
 * Resolves to the exercise as the picker lists it, so that it can be chosen straight away.
 */
export function useCreateExercise() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (form: CustomExerciseForm): Promise<LibraryExercise> => {
      const exercise = toExercise(form, await photoPaths(form));
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
        imagePaths: exercise.imagePaths,
        custom: true,
        archived: false,
      };
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['exercises'] }),
  });
}

/**
 * Saves changes to the user's own exercise: uploads new photos, then replaces its fields, and
 * removes the photos it no longer has. Loads the library and the exercise's steps again.
 */
export function useEditExercise(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ form, before }: { form: CustomExerciseForm; before: string[] }) => {
      const imagePaths = await photoPaths(form);
      const { error } = await supabase.rpc('edit_exercise', {
        exercise_id: id,
        exercise: toExercise(form, imagePaths),
      });
      if (error) {
        throw error;
      }
      // A photo left behind costs storage only, so a failure here is not the edit's.
      await removePhotos(before.filter((path) => !imagePaths.includes(path))).catch(
        (removeError: unknown) => console.warn('Could not remove old photos', removeError),
      );
    },
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ['exercises'] }),
        queryClient.invalidateQueries({ queryKey: ['exercise-instructions', id] }),
      ]),
  });
}

/** Archives the user's own exercise, or brings it back. Its history stays either way. */
export function useArchiveExercise(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (archived: boolean) => {
      const { error } = await supabase.rpc('archive_exercise', { exercise_id: id, archived });
      if (error) {
        throw error;
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['exercises'] }),
  });
}

/** Whether an exercise has logged sets, after which what it records cannot change. */
export function useIsLogged(id: string) {
  return useQuery({
    queryKey: ['workout-logs', 'exercise', id, 'logged'],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('logged_sets')
        .select('id', { count: 'exact', head: true })
        .eq('exercise_id', id);
      if (error) {
        throw error;
      }
      return (count ?? 0) > 0;
    },
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
