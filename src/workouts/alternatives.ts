import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { deviceToday } from '@/i18n/dates';
import { dbErrorMessage } from '@/lib/errors';
import { supabase } from '@/lib/supabase';

import { reloadPlan, WORKOUTS_KEY } from './workouts';

/** One version of a workout's exercises, such as one for the gym and one for home (ADR 0061). */
export type WorkoutAlternative = {
  id: number;
  /** The order of the chips, from 1. */
  position: number;
  /** Null when unnamed, shown as "Alternative N". */
  name: string | null;
  /** The one in use is the workout: its exercises are the workout's own. */
  inUse: boolean;
  /** How many exercises one not in use has; null for the one in use, whose are the workout's. */
  exerciseCount: number | null;
};

/**
 * The query key of a workout's alternatives. Under the workouts, so that whatever loads the
 * workouts again, such as an edit or a switch, loads them too.
 */
export function alternativesKey(workoutId: number) {
  return [...WORKOUTS_KEY, 'alternatives', workoutId];
}

/**
 * The alternatives of the user's workout in order; empty for a workout without alternatives, which
 * the database never keeps a single one for.
 */
export async function fetchAlternatives(workoutId: number): Promise<WorkoutAlternative[]> {
  const { data, error } = await supabase
    .from('workout_alternatives')
    .select('id, position, name, in_use, exercises')
    .eq('workout_id', workoutId)
    .order('position');
  if (error) {
    throw error;
  }
  return data.map((row) => ({
    id: row.id,
    position: row.position,
    name: row.name,
    inUse: row.in_use,
    exerciseCount: Array.isArray(row.exercises) ? row.exercises.length : null,
  }));
}

export function useWorkoutAlternatives(workoutId: number) {
  return useQuery({
    queryKey: alternativesKey(workoutId),
    queryFn: () => fetchAlternatives(workoutId),
  });
}

/** An alternative's name, or "Alternative N" for an unnamed one. */
export function useAlternativeName() {
  const { t } = useTranslation();
  return (alternative: Pick<WorkoutAlternative, 'name' | 'position'>) =>
    alternative.name ?? t('workout.alternatives.unnamed', { position: alternative.position });
}

/** What failed when changing the alternatives. */
export type AlternativeAction = 'switch' | 'add' | 'rename' | 'delete' | 'reorder';

/**
 * A short message for a refused change: the cap of `max` alternatives (BB041), the one in use,
 * which cannot be deleted (BB042), one deleted elsewhere (P0002), or else that `action` failed.
 */
export function useAlternativeError() {
  const { t } = useTranslation();
  return (error: unknown, action: AlternativeAction, max: number) =>
    dbErrorMessage(
      error,
      [
        ['alternativeLimit', t('workout.alternatives.errors.limit', { max })],
        ['alternativeInUse', t('workout.alternatives.errors.inUse')],
        ['notFound', t('workout.alternatives.errors.gone')],
      ],
      t(`workout.alternatives.errors.${action}`),
    );
}

/** What a request to the database gives, or what it refused it with, thrown. */
async function call<Result>(
  request: PromiseLike<{ data: Result; error: null } | { data: null; error: unknown }>,
): Promise<Result> {
  const response = await request;
  if (response.error) {
    throw response.error;
  }
  return response.data as Result;
}

/**
 * Puts an alternative in use from today on. Its exercises become the workout's, so the whole plan
 * loads again.
 */
export function useSwitchAlternative() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (alternativeId: number) =>
      call(
        supabase.rpc('use_workout_alternative', {
          alternative_id: alternativeId,
          today: deviceToday(),
        }),
      ),
    // A refused switch may mean the alternatives changed elsewhere, so they load again either way.
    onSettled: () => reloadPlan(queryClient),
  });
}

/** Adds a copy of the one in use to a workout, unnamed, and returns its id. */
export function useAddAlternative(workoutId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      call(
        supabase.rpc('add_workout_alternative', {
          // No name or exercises: an unnamed copy of the one in use.
          workout_id: workoutId,
          today: deviceToday(),
        }),
      ),
    onSettled: () => queryClient.invalidateQueries({ queryKey: alternativesKey(workoutId) }),
  });
}

/** Names an alternative, or leaves it unnamed when the name is blank. */
export function useRenameAlternative(workoutId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, name }: { id: number; name: string }) =>
      call(supabase.rpc('rename_workout_alternative', { alternative_id: id, name })),
    onSettled: () => queryClient.invalidateQueries({ queryKey: alternativesKey(workoutId) }),
  });
}

/** Deletes an alternative not in use; the database refuses the one in use with BB042. */
export function useDeleteAlternative(workoutId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (alternativeId: number) =>
      call(supabase.rpc('delete_workout_alternative', { alternative_id: alternativeId })),
    onSettled: () => queryClient.invalidateQueries({ queryKey: alternativesKey(workoutId) }),
  });
}

/**
 * Puts a workout's alternatives in the order of `ids`. The list takes the order at once, as the
 * dragged row already shows it, and goes back if saving fails.
 */
export function useReorderAlternatives(workoutId: number) {
  const queryClient = useQueryClient();
  const key = alternativesKey(workoutId);
  return useMutation({
    // One order at a time, so that on a slow connection an earlier one cannot land last.
    scope: { id: `workout-alternatives-${workoutId}` },
    mutationFn: (ids: number[]) =>
      call(
        supabase.rpc('reorder_workout_alternatives', {
          workout_id: workoutId,
          alternative_ids: ids,
        }),
      ),
    onMutate: async (ids) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<WorkoutAlternative[]>(key);
      queryClient.setQueryData<WorkoutAlternative[]>(key, (alternatives) =>
        alternatives
          ? ids.flatMap((id, index) => {
              const alternative = alternatives.find((other) => other.id === id);
              return alternative ? [{ ...alternative, position: index + 1 }] : [];
            })
          : alternatives,
      );
      return { previous };
    },
    onError: (_error, _ids, context) => {
      queryClient.setQueryData(key, context?.previous);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: key }),
  });
}
