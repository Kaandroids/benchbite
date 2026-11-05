// What stays when premium ends (ADR 0083): the user chooses once, in the Workouts tab, each time
// until they have, which workouts and alternative stay. Until then the ones last trained and used
// do, which is what the choice starts from. The one on a screen of its own, so it is read fresh.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useFocusEffect } from 'expo-router';
import { useCallback } from 'react';

import { deviceToday } from '@/i18n/dates';
import { supabase } from '@/lib/supabase';
import { reloadAfterPlanChange } from '@/premium/reload';

import { fetchWorkouts, useWorkoutLimits, workoutLimitsQuery, WORKOUTS_KEY } from './workouts';

/** An alternative that could stay: one added to a workout, not the one in use. */
export type ChoiceAlternative = {
  id: number;
  workoutId: number;
  position: number;
  name: string | null;
  held: boolean;
  /** When it was last the one in use; null for one never in use since it was added. */
  lastUsedAt: Date | null;
};

/** Opens the choice whenever the Workouts tab shows while it is the user's to make. */
export function useAskWhatStays() {
  const open = useWorkoutLimits().data?.choice_open === true;
  useFocusEffect(
    useCallback(() => {
      if (open) router.push('/workout/choose');
    }, [open]),
  );
}

/**
 * All the choice starts from, read as it opens: what was kept may be from before premium ended,
 * when nothing waited, and it would pick the wrong workouts on a choice made once.
 */
export function useChoiceData() {
  const limits = useQuery({ ...workoutLimitsQuery, refetchOnMount: 'always' });
  const workouts = useQuery({
    queryKey: WORKOUTS_KEY,
    queryFn: fetchWorkouts,
    refetchOnMount: 'always',
  });
  const alternatives = useQuery({
    queryKey: [...WORKOUTS_KEY, 'choice-alternatives'],
    refetchOnMount: 'always',
    queryFn: async (): Promise<ChoiceAlternative[]> => {
      const { data, error } = await supabase
        .from('workout_alternatives')
        .select('id, workout_id, position, name, held, last_used_at')
        .not('exercises', 'is', null)
        .order('last_used_at', { ascending: false, nullsFirst: false })
        .order('id', { ascending: false });
      if (error) {
        throw error;
      }
      return data.map((row) => ({
        id: row.id,
        workoutId: row.workout_id,
        position: row.position,
        name: row.name,
        held: row.held,
        lastUsedAt: row.last_used_at ? new Date(row.last_used_at) : null,
      }));
    },
  });
  const lastTrained = useQuery({
    queryKey: [...WORKOUTS_KEY, 'last-trained'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('workouts_last_trained');
      if (error) {
        throw error;
      }
      return new Map(data.map((row) => [row.workout_id, row.started_on]));
    },
  });
  return { limits, workouts, alternatives, lastTrained };
}

/** The alternative picked at first, of those of the kept workouts: the one that stays now, or the one last used. */
export function firstAlternative(candidates: ChoiceAlternative[]) {
  return (candidates.find((alternative) => !alternative.held) ?? candidates[0])?.id;
}

/** Makes the user's one choice, and loads again all that depends on it. */
export function useChooseWhatStays() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      workouts,
      alternatives,
    }: {
      workouts: number[];
      alternatives: number[];
    }) => {
      const { error } = await supabase.rpc('choose_what_stays', {
        workouts,
        alternatives,
        today: deviceToday(),
      });
      if (error) {
        throw error;
      }
    },
    // Also when refused, as one made elsewhere closes it here too.
    onSettled: () => reloadAfterPlanChange(queryClient),
  });
}
