import { useQuery } from '@tanstack/react-query';

import type { Database } from '@/lib/database.types';
import { supabase } from '@/lib/supabase';

export type NutritionTargets = {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
};

type TargetsRow = Database['public']['CompositeTypes']['nutrition_targets'];

/** The targets from the database's result, or null where it has none. */
export function targetsFrom(row: TargetsRow): NutritionTargets | null {
  if (row.calories === null) {
    return null;
  }
  return {
    calories: row.calories,
    proteinG: row.protein_g ?? 0,
    carbsG: row.carbs_g ?? 0,
    fatG: row.fat_g ?? 0,
  };
}

/**
 * The signed-in user's daily targets, calculated by the database from their saved profile, goal
 * and latest weight (ADR 0009). Null until the onboarding is saved.
 */
export function useNutritionTargets() {
  return useQuery({
    queryKey: ['nutrition-targets'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('my_nutrition_targets');
      if (error) {
        throw error;
      }
      return targetsFrom(data);
    },
  });
}
