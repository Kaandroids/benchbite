import { useMutation } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';

import type { Portion } from './foods';
import type { Totals } from './meals';
import { useReloadFoods } from './quick-foods';

/** A food of one's own as the form saves it: its name trimmed, its values per 100 g and one portion, if any. */
export type CustomFoodValues = {
  name: string;
  per100g: Totals;
  portion: Portion | null;
};

function columnsOf({ name, per100g, portion }: CustomFoodValues) {
  return {
    name,
    kcal: per100g.calories,
    protein_g: per100g.proteinG,
    carbs_g: per100g.carbsG,
    fat_g: per100g.fatG,
    portion_unit: portion?.unit ?? null,
    portion_grams: portion?.grams ?? null,
  };
}

/** Adds a food of one's own and gives its id, to log it right away (ADR 0036). */
export function useCreateFood() {
  const reload = useReloadFoods();
  return useMutation({
    mutationFn: async (values: CustomFoodValues): Promise<number> => {
      const { data, error } = await supabase
        .from('custom_foods')
        .insert(columnsOf(values))
        .select('id')
        .single();
      if (error) {
        throw error;
      }
      return data.id;
    },
    onSuccess: reload,
  });
}

/** Changes a food of one's own. Past entries keep the values they copied (ADR 0034). */
export function useUpdateFood() {
  const reload = useReloadFoods();
  return useMutation({
    mutationFn: async ({ id, values }: { id: number; values: CustomFoodValues }) => {
      const { error } = await supabase.from('custom_foods').update(columnsOf(values)).eq('id', id);
      if (error) {
        throw error;
      }
    },
    onSuccess: reload,
  });
}

/**
 * Deletes a food of one's own: it is archived, so that past entries keep it, and the database
 * sets the time (ADR 0036).
 */
export function useDeleteFood() {
  const reload = useReloadFoods();
  return useMutation({
    mutationFn: async (id: number) => {
      const { error } = await supabase
        .from('custom_foods')
        .update({ archived_at: new Date().toISOString() })
        .eq('id', id);
      if (error) {
        throw error;
      }
    },
    // Not waited for, so that the screen leaves before the food it shows reloads as deleted.
    onSuccess: () => {
      void reload();
    },
  });
}
