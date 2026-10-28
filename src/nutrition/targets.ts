import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { Database } from '@/lib/database.types';
import { toIsoDate } from '@/i18n/dates';
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

/** The query key of the targets a day kept, for anything that logs to it. */
export const dayTargetsKey = (day: string) => ['nutrition-targets', 'day', day];

/**
 * The targets a day is measured against (ADR 0040): today the ones in use, a past day the ones it
 * kept, or the ones in use when nothing was logged on it. The database decides; the device says
 * which day is today.
 */
export function useDayTargets(day: string) {
  return useQuery({
    queryKey: dayTargetsKey(day),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('targets_of_day', {
        on_day: day,
        today: toIsoDate(new Date()),
      });
      if (error) {
        throw error;
      }
      return targetsFrom(data);
    },
  });
}

/**
 * Writes the targets in use over today and the days after it that kept some, after they changed:
 * a day follows them while it lasts, and keeps the last ones once it is past (ADR 0040).
 */
export async function keepTargetsFromToday() {
  const { error } = await supabase.rpc('refresh_day_nutrition_targets', {
    from_day: toIsoDate(new Date()),
  });
  if (error) {
    throw error;
  }
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
      await keepTargetsFromToday();
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
      await keepTargetsFromToday();
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
  /** For the lowest healthy target weight. */
  heightCm: number;
};

/** The saved goal and activity the calculated targets come from; null before the onboarding. */
export function useTargetBasis() {
  return useQuery({
    queryKey: ['nutrition-targets', 'basis'],
    queryFn: async (): Promise<TargetBasis | null> => {
      const [goal, profile] = await Promise.all([
        supabase.from('goals').select('kind, target_weight_kg, weekly_pace_kg').maybeSingle(),
        supabase.from('profiles').select('activity_level, height_cm').maybeSingle(),
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
        heightCm: profile.data.height_cm,
      };
    },
  });
}

/** A goal, target weight, pace and activity to work the targets out from (ADR 0039). */
export type TargetAnswers = Pick<
  TargetBasis,
  'goal' | 'targetWeightKg' | 'weeklyPaceKg' | 'activity'
>;

/** The arguments of the database's functions for the answers. */
function answersArgs(answers: TargetAnswers) {
  return {
    goal: answers.goal,
    // Generated as numbers, though the functions take null for goals that keep the weight.
    target_weight_kg: answers.targetWeightKg as number,
    weekly_pace_kg: answers.weeklyPaceKg as number,
    activity_level: answers.activity,
  };
}

/** Saves new answers and puts the calculated targets back in use, from today on. */
export function useRecalculateTargets() {
  const reload = useReloadTargets();
  return useMutation({
    mutationFn: async (answers: TargetAnswers) => {
      const { error } = await supabase.rpc('recalculate_nutrition_targets', answersArgs(answers));
      if (error) {
        throw error;
      }
      await keepTargetsFromToday();
    },
    onSuccess: reload,
  });
}
