import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import type { Database } from '@/lib/database.types';
import { supabase } from '@/lib/supabase';

type Enums = Database['public']['Enums'];

export type LibraryExercise = {
  id: string;
  /** The name in the app language, falling back to English. */
  name: string;
  englishName: string;
  metrics: Enums['exercise_metric'][];
  primaryMuscles: Enums['muscle'][];
  secondaryMuscles: Enums['muscle'][];
  equipment: Enums['equipment'] | null;
  level: Enums['exercise_level'];
  category: Enums['exercise_category'];
  imagePaths: string[];
};

/** The muscle groups the exercise picker filters by, and the muscles each one includes. */
export const MUSCLE_GROUPS = {
  chest: ['chest'],
  back: ['lats', 'middle back', 'lower back', 'traps'],
  shoulders: ['shoulders', 'neck'],
  arms: ['biceps', 'triceps', 'forearms'],
  legs: ['quadriceps', 'hamstrings', 'glutes', 'calves', 'abductors', 'adductors'],
  core: ['abdominals'],
} satisfies Record<string, Enums['muscle'][]>;

/** A filter of the picker: a muscle group, or cardio, which is a category of its own. */
export type ExerciseFilter = keyof typeof MUSCLE_GROUPS | 'cardio';

export async function fetchLibrary(language: string): Promise<LibraryExercise[]> {
  const { data, error } = await supabase
    .from('exercises')
    .select(
      `id, name, metrics, primary_muscles, secondary_muscles, equipment, level, category,
      image_paths, exercise_translations (language, name)`,
    )
    .order('name');
  if (error) {
    throw error;
  }
  return data
    .map((row) => ({
      id: row.id,
      name:
        row.exercise_translations.find((translation) => translation.language === language)?.name ??
        row.name,
      englishName: row.name,
      metrics: row.metrics,
      primaryMuscles: row.primary_muscles,
      secondaryMuscles: row.secondary_muscles,
      equipment: row.equipment,
      level: row.level,
      category: row.category,
      imagePaths: row.image_paths,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, language));
}

/** Every exercise of the library, with names in the app language. It rarely changes. */
export function useExerciseLibrary() {
  const { i18n } = useTranslation();
  return useQuery({
    queryKey: ['exercises', i18n.language],
    queryFn: () => fetchLibrary(i18n.language),
    staleTime: Infinity,
  });
}

/** Lower case and without accents, so that "kniebeuge" finds "Kniebeuge" and "sinav" "şınav". */
function searchable(text: string, language: string): string {
  return text.toLocaleLowerCase(language).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ı/g, 'i');
}

/**
 * The exercises whose name, in the app language or in English, contains every word of the query,
 * within the filter.
 */
export function filterExercises(
  exercises: LibraryExercise[],
  query: string,
  filter: ExerciseFilter | null,
  language: string,
): LibraryExercise[] {
  const words = searchable(query, language).split(/\s+/).filter(Boolean);
  return exercises.filter((exercise) => {
    if (filter === 'cardio' && exercise.category !== 'cardio') {
      return false;
    }
    if (
      filter &&
      filter !== 'cardio' &&
      !exercise.primaryMuscles.some((muscle) =>
        (MUSCLE_GROUPS[filter] as string[]).includes(muscle),
      )
    ) {
      return false;
    }
    const names = `${searchable(exercise.name, language)} ${searchable(exercise.englishName, language)}`;
    return words.every((word) => names.includes(word));
  });
}

export type ExerciseDetails = LibraryExercise & { instructions: string[] };

/** One exercise with its instructions, which are only in English for now (#76). */
export function useExerciseDetails(id: string) {
  const library = useExerciseLibrary();
  const instructions = useQuery({
    queryKey: ['exercise-instructions', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('exercises')
        .select('instructions')
        .eq('id', id)
        .single();
      if (error) {
        throw error;
      }
      return data.instructions;
    },
    staleTime: Infinity,
  });
  return { library, instructions };
}
