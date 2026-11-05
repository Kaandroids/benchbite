// What stays when premium ends (ADR 0083): the user chooses once, in the Workouts tab, each time
// until they have, which workouts and alternatives stay. Until then the ones last trained and used
// do, which is what the choice starts from.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useFocusEffect } from 'expo-router';
import { useCallback } from 'react';

import { toIsoDate } from '@/i18n/dates';
import { supabase } from '@/lib/supabase';
import { reloadAfterPlanChange } from '@/premium/reload';

import { useWorkoutLimits, WORKOUTS_KEY } from './workouts';

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

/** What the plan allows of the alternatives: versions of a workout, and in all with no limit null. */
type AlternativeLimits = { versions: number; added: number | null };

/** Opens the choice whenever the Workouts tab shows while it is the user's to make. */
export function useAskWhatStays() {
  const open = useWorkoutLimits().data?.choice_open === true;
  useFocusEffect(
    useCallback(() => {
      if (open) router.push('/workout/choose');
    }, [open]),
  );
}

/** The alternatives of the user's active workouts that could stay. */
export function useChoiceAlternatives() {
  return useQuery({
    queryKey: [...WORKOUTS_KEY, 'choice-alternatives'],
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
}

/** When each workout was last trained, as an ISO date by its id. */
export function useLastTrained() {
  return useQuery({
    queryKey: [...WORKOUTS_KEY, 'last-trained'],
    queryFn: async (): Promise<Map<number, string>> => {
      const { data, error } = await supabase
        .from('workout_logs')
        .select('workout_id, started_on')
        .not('workout_id', 'is', null)
        .order('started_on');
      if (error) {
        throw error;
      }
      // Oldest first, so that each workout ends on its latest.
      return new Map(data.map((log) => [log.workout_id as number, log.started_on]));
    },
  });
}

/** Of `alternatives`, those of the `kept` workouts. */
export function alternativesOf(alternatives: ChoiceAlternative[], kept: number[]) {
  return alternatives.filter((alternative) => kept.includes(alternative.workoutId));
}

/**
 * How many of a kept workouts' alternatives stay: of each workout as many as its versions allow,
 * the one in use being one, and of those as many as the plan allows in all.
 */
export function alternativesThatStay(candidates: ChoiceAlternative[], limits: AlternativeLimits) {
  const perWorkout = new Map<number, number>();
  for (const { workoutId } of candidates) {
    perWorkout.set(workoutId, (perWorkout.get(workoutId) ?? 0) + 1);
  }
  const allowed = [...perWorkout.values()].reduce(
    (total, count) => total + Math.min(count, limits.versions - 1),
    0,
  );
  return Math.min(allowed, limits.added ?? allowed);
}

/**
 * The alternatives picked at first: the ones that stay now and then the ones last used, up to
 * `count`. `candidates` come last used first.
 */
export function firstAlternatives(candidates: ChoiceAlternative[], count: number) {
  const staying = candidates.filter((alternative) => !alternative.held);
  const rest = candidates.filter((alternative) => alternative.held);
  return [...staying, ...rest].slice(0, count).map((alternative) => alternative.id);
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
        today: toIsoDate(new Date()),
      });
      if (error) {
        throw error;
      }
    },
    // Also when refused, as one made elsewhere closes it here too.
    onSettled: () => reloadAfterPlanChange(queryClient),
  });
}
