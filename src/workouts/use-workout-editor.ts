import { router } from 'expo-router';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert } from 'react-native';

import { allLoaded } from '@/components/load-state';
import { useExerciseLibrary } from '@/exercises/library';
import { isDbError } from '@/lib/errors';

import { clearDraft, startDraft, updateDraft, useDraft, type DraftExercise } from './draft';
import { useWorkoutName } from './format';
import {
  findWorkout,
  useDeleteWorkout,
  useSaveWorkout,
  useWorkoutLimits,
  useWorkouts,
} from './workouts';

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
  const remove = useDeleteWorkout();
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
            exercises: workout.exercises.map(({ exerciseId, sets, target, restSeconds }) => ({
              exerciseId,
              sets,
              target,
              restSeconds,
            })),
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
      console.warn('Could not save the workout', error);
      // The limits can change after they were loaded, or another device can add a workout.
      Alert.alert(
        t('common.notSaved'),
        isDbError(error, 'exerciseLimit')
          ? t('editor.limit', { max })
          : isDbError(error, 'workoutLimit')
            ? t('workout.limit', { max: limits.data?.workouts ?? 0 })
            : t('editor.saveError'),
      );
    }
  };

  const onDelete = () => {
    if (draft?.id === undefined) {
      return;
    }
    const workoutId = draft.id;
    Alert.alert(t('editor.deleteTitle'), t('editor.deleteMessage'), [
      { text: t('editor.cancel'), style: 'cancel' },
      {
        text: t('editor.delete'),
        style: 'destructive',
        onPress: () =>
          void remove.mutateAsync(workoutId).then(
            // Closes the editor and the deleted workout, back to the list it was opened from.
            () => router.dismiss(2),
            (error: unknown) => console.warn('Could not delete the workout', error),
          ),
      },
    ]);
  };

  const setExercises = (change: (exercises: DraftExercise[]) => DraftExercise[]) =>
    updateDraft((current) => ({ ...current, exercises: change(current.exercises) }));
  const setName = (name: string) => updateDraft((current) => ({ ...current, name }));
  const setWeekdays = (weekdays: number[]) => updateDraft((current) => ({ ...current, weekdays }));
  const moveExercise = (from: number, to: number) =>
    setExercises((exercises) => {
      const next = [...exercises];
      const [moved] = next.splice(from, 1);
      if (moved) {
        next.splice(to, 0, moved);
      }
      return next;
    });
  const replaceExercise = (changed: DraftExercise) =>
    setExercises((exercises) =>
      exercises.map((exercise) => (exercise.key === changed.key ? changed : exercise)),
    );
  const removeExercise = (key: string) =>
    setExercises((exercises) => exercises.filter((exercise) => exercise.key !== key));

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
    deleting: remove.isPending,
    onSave,
    onDelete,
    setName,
    setWeekdays,
    moveExercise,
    replaceExercise,
    removeExercise,
  };
}
