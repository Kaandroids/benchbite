import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { deviceToday } from '@/i18n/dates';
import { dbErrorMessage } from '@/lib/errors';
import { supabase } from '@/lib/supabase';

import { reloadPlan, useWorkoutLimits, WORKOUTS_KEY } from './workouts';

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
export type AlternativeAction = 'switch' | 'add' | 'duplicate' | 'rename' | 'delete' | 'reorder';

/**
 * A short message for a refused change: the cap of alternatives (BB041), the one in use, which
 * cannot be deleted (BB042), the last other one while the one in use is empty (BB043), one deleted
 * elsewhere (P0002), or else that `action` failed.
 */
export function useAlternativeError() {
  const { t } = useTranslation();
  const max = useWorkoutLimits().data?.alternatives ?? 0;
  return (error: unknown, action: AlternativeAction) =>
    dbErrorMessage(
      error,
      [
        ['alternativeLimit', t('workout.alternatives.errors.limit', { max })],
        ['alternativeInUse', t('workout.alternatives.errors.inUse')],
        ['alternativeLastOfEmpty', t('workout.alternatives.errors.lastOfEmpty')],
        ['notFound', t('workout.alternatives.errors.gone')],
      ],
      t(`workout.alternatives.errors.${action}`),
    );
}

/**
 * Puts an alternative in use from today on. Its exercises become the workout's, so the whole plan
 * loads again.
 */
export function useSwitchAlternative() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (alternativeId: number) => {
      const { error } = await supabase.rpc('use_workout_alternative', {
        alternative_id: alternativeId,
        today: deviceToday(),
      });
      if (error) {
        throw error;
      }
    },
    // A refused switch may mean the alternatives changed elsewhere, so they load again either way.
    onSettled: () => reloadPlan(queryClient),
  });
}

type ChooseAlternativeOptions = {
  /** The workout's alternatives, while they are loaded. */
  alternatives: WorkoutAlternative[] | undefined;
  /** Whether the workout is running, which a switch would change under it. */
  running: boolean;
  /** Called instead of a switch while the workout is running, to have it finished first. */
  onRunning: () => void;
};

/**
 * Choosing the alternative in use, for the chips, the sheet's rows and a new alternative once
 * named alike. Mounted once on the workout's screen, so that all of them see the same switch:
 * `chosenId` is the one being switched to until the workout has loaded with it, `isPending` holds
 * every other choice and Start meanwhile, and `error` says why the last switch failed.
 */
export function useChooseAlternative({
  alternatives,
  running,
  onRunning,
}: ChooseAlternativeOptions) {
  const switchAlternative = useSwitchAlternative();
  const errorOf = useAlternativeError();
  const [error, setError] = useState<string | null>(null);
  const chosenId = switchAlternative.isPending
    ? switchAlternative.variables
    : alternatives?.find((alternative) => alternative.inUse)?.id;

  /** Puts `id` in use, unless it already is or another switch runs; `onSuccess` once it is. */
  const choose = (id: number, callbacks: { onSuccess?: () => void; onError?: () => void } = {}) => {
    // Like an edit, a switch would change the exercises of the workout running.
    if (running) {
      onRunning();
      return;
    }
    if (switchAlternative.isPending || id === chosenId) return;
    setError(null);
    switchAlternative.mutate(id, {
      onSuccess: callbacks.onSuccess,
      onError: (failure) => {
        setError(errorOf(failure, 'switch'));
        callbacks.onError?.();
      },
    });
  };

  return {
    chosenId,
    choose,
    error,
    /** Forgets why the last switch failed, as another change of the alternatives starts. */
    clearError: () => setError(null),
    isPending: switchAlternative.isPending,
  };
}

export type AlternativeChoice = ReturnType<typeof useChooseAlternative>;

/**
 * What a new alternative starts with: no exercises, as Add makes it, or a copy of an alternative's
 * exercises, sets and rests, as Duplicate makes it; of the one in use when `copyOf` is null, as
 * for a workout without alternatives, whose own exercises have no row yet.
 */
export type NewAlternative = { empty: true } | { copyOf: number | null };

/** Adds an unnamed alternative to a workout, last, and returns its id. */
export function useAddAlternative(workoutId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (from: NewAlternative) => {
      const { data, error } = await supabase.rpc('add_workout_alternative', {
        workout_id: workoutId,
        today: deviceToday(),
        ...('empty' in from
          ? { exercises: [] }
          : from.copyOf !== null
            ? { source_alternative_id: from.copyOf }
            : {}),
      });
      if (error) {
        throw error;
      }
      return data;
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: alternativesKey(workoutId) }),
  });
}

/** Names an alternative, or leaves it unnamed when the name is blank. */
export function useRenameAlternative(workoutId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, name }: { id: number; name: string }) => {
      const { error } = await supabase.rpc('rename_workout_alternative', {
        alternative_id: id,
        name,
      });
      if (error) {
        throw error;
      }
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: alternativesKey(workoutId) }),
  });
}

/**
 * Deletes an alternative not in use; the database refuses the one in use with BB042, and the last
 * other one while the one in use has no exercises with BB043.
 */
export function useDeleteAlternative(workoutId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (alternativeId: number) => {
      const { error } = await supabase.rpc('delete_workout_alternative', {
        alternative_id: alternativeId,
      });
      if (error) {
        throw error;
      }
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: alternativesKey(workoutId) }),
  });
}

/**
 * Puts a workout's alternatives in the order of `ids`. The list takes the order at once, as the
 * dragged row already shows it, and goes back if saving fails. While a later order waits, it
 * neither goes back nor loads again, so that the rows keep the later order rather than jump.
 */
export function useReorderAlternatives(workoutId: number) {
  const queryClient = useQueryClient();
  const key = alternativesKey(workoutId);
  const mutationKey = ['reorder-alternatives', workoutId];
  // This one is still pending while it settles, so it is the last when it is the only one.
  const last = () => queryClient.isMutating({ mutationKey }) === 1;
  return useMutation({
    mutationKey,
    // One order at a time, so that on a slow connection an earlier one cannot land last.
    scope: { id: `workout-alternatives-${workoutId}` },
    mutationFn: async (ids: number[]) => {
      const { error } = await supabase.rpc('reorder_workout_alternatives', {
        workout_id: workoutId,
        alternative_ids: ids,
      });
      if (error) {
        throw error;
      }
    },
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
      if (last()) {
        queryClient.setQueryData(key, context?.previous);
      }
    },
    onSettled: () => (last() ? queryClient.invalidateQueries({ queryKey: key }) : undefined),
  });
}
