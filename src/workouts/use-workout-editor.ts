import { router } from 'expo-router';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert } from 'react-native';

import { allLoaded } from '@/components/load-state';
import { useExerciseLibrary } from '@/exercises/library';
import { dbErrorMessage } from '@/lib/errors';
import { reportError } from '@/lib/reporting';

import { useConfirmDeleteWorkout } from './confirm-delete';
import { clearDraft, startDraft, updateDraft, useDraft, type DraftExercise } from './draft';
import { useWorkoutName } from './format';
import type { SetTarget } from './set-targets';
import { changeInSuperset, joinWithNext, moveWithSupersets, tidySupersets } from './supersets';
import { findWorkout, useSaveWorkout, useWorkoutLimits, useWorkouts } from './workouts';

/**
 * The draft of the workout with the id, or of a new one, started once the workouts load, with
 * whether it can be saved, the changes that can be made to it, and the actions that save or delete
 * it.
 */
export function useWorkoutEditor(id: number | undefined) {
  const { t } = useTranslation();
  const workouts = useWorkouts();
  const library = useExerciseLibrary();
  const limits = useWorkoutLimits();
  const draft = useDraft();
  const save = useSaveWorkout();
  const { confirm: confirmDelete, deleting } = useConfirmDeleteWorkout();
  const workoutName = useWorkoutName();
  const workout = findWorkout(workouts.data, id);
  // A workout from the plan builder is named by its type until the user gives it a name.
  const typeName = workout && workout.name === null ? workoutName(workout) : null;
  const queries = [workouts, library, limits];
  const loaded = allLoaded(queries);

  // Starts the draft once the workout is loaded.
  useEffect(() => {
    if (!loaded || (id !== undefined && !workout)) {
      return;
    }
    startDraft(
      workout
        ? {
            id: workout.id,
            name: workout.name ?? '',
            weekdays: workout.weekdays,
            exercises: workout.exercises.map(
              ({ exerciseId, sets, target, restSeconds, superset, setTargets }) => ({
                exerciseId,
                sets,
                target,
                restSeconds,
                superset,
                setTargets,
              }),
            ),
          }
        : { name: '', weekdays: [], exercises: [] },
    );
    // Only when the screen opens or the workout first loads, not on every change of the list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, id, workout?.id]);

  useEffect(() => clearDraft, []);

  const max = limits.data?.exercises ?? 0;
  const over = draft ? draft.exercises.length - max : 0;
  const canSave =
    !!draft &&
    (draft.name.trim() !== '' || typeName !== null) &&
    draft.exercises.length > 0 &&
    over <= 0;

  const onSave = async () => {
    if (!draft) {
      return;
    }
    try {
      await save.mutateAsync({
        ...(draft.id !== undefined ? { id: draft.id } : {}),
        name: draft.name.trim() || null,
        weekdays: draft.weekdays,
        exercises: draft.exercises.map(({ key: _key, ...exercise }) => exercise),
      });
      router.back();
    } catch (error) {
      reportError('Could not save the workout', error);
      // The limits can change after they were loaded, or another device can add a workout.
      Alert.alert(
        t('common.notSaved'),
        dbErrorMessage(
          error,
          [
            ['exerciseLimit', t('editor.limit', { max })],
            ['workoutLimit', t('workout.limit', { max: limits.data?.workouts ?? 0 })],
            ['waitsForPremium', t('workout.waits')],
          ],
          t('editor.saveError'),
        ),
      );
    }
  };

  const onDelete = () => {
    if (draft?.id === undefined) {
      return;
    }
    // Closes the editor and the deleted workout, back to the list it was opened from.
    confirmDelete(draft.id, { onDeleted: () => router.dismiss(2) });
  };

  const setExercises = (change: (exercises: DraftExercise[]) => DraftExercise[]) =>
    updateDraft((current) => ({ ...current, exercises: change(current.exercises) }));
  const setName = (name: string) => updateDraft((current) => ({ ...current, name }));
  const setWeekdays = (weekdays: number[]) => updateDraft((current) => ({ ...current, weekdays }));
  /** Moves an exercise, and returns where it ended up, which a superset may change. */
  const moveExercise = (from: number, to: number) => {
    if (!draft) {
      return to;
    }
    const moved = moveWithSupersets(draft.exercises, from, to);
    setExercises(() => moved);
    return moved.findIndex((exercise) => exercise.key === draft.exercises[from]?.key);
  };
  const replaceExercise = (changed: DraftExercise) =>
    setExercises((exercises) => changeInSuperset(exercises, changed));
  const removeExercise = (key: string) =>
    setExercises((exercises) =>
      tidySupersets(exercises.filter((exercise) => exercise.key !== key)),
    );
  /**
   * Changes the own set targets of the exercise as it is when the change is made, which a change
   * waiting for last time's sets must not make from the exercise as it was before.
   */
  const changeTargets = (key: string, change: (exercise: DraftExercise) => SetTarget[] | null) =>
    setExercises((exercises) =>
      exercises.map((exercise) =>
        exercise.key === key ? { ...exercise, setTargets: change(exercise) } : exercise,
      ),
    );
  /** Joins the exercise with the one after it into a superset, or parts them. */
  const joinExerciseWithNext = (key: string, joined: boolean) =>
    setExercises((exercises) =>
      joinWithNext(
        exercises,
        exercises.findIndex((exercise) => exercise.key === key),
        joined,
      ),
    );

  return {
    draft,
    workout,
    typeName,
    library,
    queries,
    loaded,
    max,
    over,
    canSave,
    saving: save.isPending,
    deleting,
    onSave,
    onDelete,
    setName,
    setWeekdays,
    moveExercise,
    replaceExercise,
    changeTargets,
    removeExercise,
    joinExerciseWithNext,
  };
}
