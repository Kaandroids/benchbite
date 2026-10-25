import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert } from 'react-native';

import { useLeavePrompt } from '@/components/use-leave-prompt';
import { findExercise, type LibraryExercise } from '@/exercises/library';
import { isDbError } from '@/lib/errors';
import { setKindOf } from '@/sets/fields';
import { EMPTY_SET, missingFields, type SetValues } from '@/sets/values';

import { useEditLog, type LoggedExercise, type LogSummary } from './history';

export type EditedSet = SetValues & { key: number };
export type EditedExercise = { place: number; exerciseId: string; sets: EditedSet[] };

/**
 * The sets of a finished workout being corrected, with the changes to them, what still misses, and
 * saving. Leaving with changes asks first.
 */
export function useLogEdit(log: LogSummary, initial: LoggedExercise[], library: LibraryExercise[]) {
  const { t } = useTranslation();
  const edit = useEditLog();
  // Each set gets a key of its own, so that removing one keeps the others' inputs in place.
  const [original] = useState<EditedExercise[]>(() => {
    let key = 0;
    return initial.map((exercise) => ({
      place: exercise.place,
      exerciseId: exercise.exerciseId,
      sets: exercise.sets.map(({ weightKg, reps, seconds, meters }) => ({
        weightKg,
        reps,
        seconds,
        meters,
        key: key++,
      })),
    }));
  });
  const [exercises, setExercises] = useState(original);
  // Missing values are marked once saving was tried.
  const [checked, setChecked] = useState(false);

  const valuesOf = (list: EditedExercise[]) =>
    JSON.stringify(list.map((exercise) => exercise.sets.map(({ key: _key, ...values }) => values)));
  const changed = valuesOf(exercises) !== valuesOf(original);
  const leaveWithoutAsking = useLeavePrompt(
    changed,
    t('history.edit.discardTitle'),
    t('history.edit.discardMessage'),
  );

  const kindOf = (exerciseId: string) =>
    setKindOf(findExercise(library, exerciseId)?.metrics, { reps: { min: 1, max: 1 } });
  const setCount = exercises.reduce((total, exercise) => total + exercise.sets.length, 0);
  const incomplete = exercises.some((exercise) =>
    exercise.sets.some((set) => missingFields(set, kindOf(exercise.exerciseId)).length > 0),
  );

  const changeSets = (index: number, change: (sets: EditedSet[]) => EditedSet[]) =>
    setExercises((current) =>
      current.map((exercise, i) =>
        i === index ? { ...exercise, sets: change(exercise.sets) } : exercise,
      ),
    );

  // A new set repeats the one before it, like during a workout.
  const addSet = (index: number) =>
    setExercises((current) => {
      const key = Math.max(-1, ...current.flatMap((item) => item.sets.map((s) => s.key)));
      return current.map((item, i) => {
        if (i !== index) {
          return item;
        }
        const { key: _key, ...values } = item.sets[item.sets.length - 1] ?? {
          ...EMPTY_SET,
          key: 0,
        };
        return { ...item, sets: [...item.sets, { ...values, key: key + 1 }] };
      });
    });

  const save = async () => {
    if (incomplete) {
      setChecked(true);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      return;
    }
    try {
      await edit.mutateAsync({
        id: log.id,
        exercises: exercises.map((exercise) => ({
          place: exercise.place,
          exerciseId: exercise.exerciseId,
          sets: exercise.sets.map(({ key: _key, ...values }) => values),
        })),
      });
      leaveWithoutAsking(() => router.back());
    } catch (error) {
      console.warn('Could not save the workout log', error);
      Alert.alert(
        t('common.notSaved'),
        isDbError(error, 'logNotFound')
          ? t('history.notFound.message')
          : t('history.edit.saveError'),
      );
    }
  };

  return {
    exercises,
    kindOf,
    setCount,
    incomplete,
    checked,
    canSave: setCount > 0 && !edit.isPending,
    changeSets,
    addSet,
    save,
  };
}
