import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { Database } from '@/lib/database.types';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/providers/session-provider';

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

/** The calculated targets, whether or not the user uses their own (ADR 0039). */
export function useCalculatedTargets() {
  return useQuery({
    queryKey: ['nutrition-targets', 'calculated'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('calculated_nutrition_targets');
      if (error) {
        throw error;
      }
      return targetsFrom(data);
    },
  });
}

/** The targets the user set themselves, and whether they are in use; null before any are set. */
export function useOwnTargets() {
  return useQuery({
    queryKey: ['nutrition-targets', 'own'],
    queryFn: async (): Promise<{ targets: NutritionTargets; inUse: boolean } | null> => {
      const { data, error } = await supabase
        .from('own_nutrition_targets')
        .select('calories, protein_g, carbs_g, fat_g, in_use')
        .maybeSingle();
      if (error) {
        throw error;
      }
      return data
        ? {
            targets: {
              calories: data.calories,
              proteinG: data.protein_g,
              carbsG: data.carbs_g,
              fatG: data.fat_g,
            },
            inUse: data.in_use,
          }
        : null;
    },
  });
}

/** Everything that reads targets: the ones in use, the calculated ones and the user's own. */
function useReloadTargets() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ['nutrition-targets'] });
}

/** Sets the user's own targets and puts them in use. */
export function useSetOwnTargets() {
  const reload = useReloadTargets();
  return useMutation({
    mutationFn: async (targets: NutritionTargets) => {
      const { error } = await supabase.from('own_nutrition_targets').upsert(
        {
          calories: targets.calories,
          protein_g: targets.proteinG,
          carbs_g: targets.carbsG,
          fat_g: targets.fatG,
          in_use: true,
        },
        { onConflict: 'user_id' },
      );
      if (error) {
        throw error;
      }
    },
    onSuccess: reload,
  });
}

/** Puts the calculated targets back in use, keeping the user's own for next time. */
export function useUseCalculatedTargets() {
  const reload = useReloadTargets();
  const session = useSession();
  return useMutation({
    mutationFn: async () => {
      if (session.status !== 'ready') {
        throw new Error('Not signed in');
      }
      const { error } = await supabase
        .from('own_nutrition_targets')
        .update({ in_use: false })
        .eq('user_id', session.session.user.id);
      if (error) {
        throw error;
      }
    },
    onSuccess: reload,
  });
}

/** What the calculated targets are worked out from: the goal, its target and pace, and activity. */
export type TargetBasis = {
  goal: Database['public']['Enums']['goal_kind'];
  targetWeightKg: number | null;
  weeklyPaceKg: number | null;
  activity: Database['public']['Enums']['activity_level'];
};

/** The saved goal and activity the calculated targets come from; null before the onboarding. */
export function useTargetBasis() {
  return useQuery({
    queryKey: ['nutrition-targets', 'basis'],
    queryFn: async (): Promise<TargetBasis | null> => {
      const [goal, profile] = await Promise.all([
        supabase.from('goals').select('kind, target_weight_kg, weekly_pace_kg').maybeSingle(),
        supabase.from('profiles').select('activity_level').maybeSingle(),
      ]);
      if (goal.error) {
        throw goal.error;
      }
      if (profile.error) {
        throw profile.error;
      }
      if (!goal.data || !profile.data) {
        return null;
      }
      return {
        goal: goal.data.kind,
        targetWeightKg: goal.data.target_weight_kg,
        weeklyPaceKg: goal.data.weekly_pace_kg,
        activity: profile.data.activity_level,
      };
    },
  });
}
