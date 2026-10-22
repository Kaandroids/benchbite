import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { supabase } from '@/lib/supabase';

/**
 * The names of exercises in the app language, falling back to English, by exercise id. It is
 * empty until they are loaded, and stays so if loading fails.
 */
export function useExerciseNames(ids: readonly string[]): Record<string, string> {
  const { i18n } = useTranslation();
  const [names, setNames] = useState<Record<string, string>>({});
  // A string, so that a new list with the same ids does not load them again.
  const key = [...new Set(ids)].join(',');

  useEffect(() => {
    if (!key) {
      return;
    }
    let cancelled = false;
    void supabase
      .from('exercises')
      .select('id, name, exercise_translations (language, name)')
      .in('id', key.split(','))
      .then(({ data }) => {
        if (cancelled || !data) return;
        setNames(
          Object.fromEntries(
            data.map((exercise) => [
              exercise.id,
              exercise.exercise_translations.find((t) => t.language === i18n.language)?.name ??
                exercise.name,
            ]),
          ),
        );
      });
    return () => {
      cancelled = true;
    };
  }, [key, i18n.language]);

  return names;
}
