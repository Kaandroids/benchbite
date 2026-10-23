import * as Haptics from 'expo-haptics';
import { router, usePreventRemove } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { allLoaded, LoadState } from '@/components/load-state';
import { Icon } from '@/components/ui/icon';
import { MessageView } from '@/components/ui/message-view';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { ExerciseThumbnail } from '@/exercises/exercise-thumbnail';
import { useExerciseLibrary, type LibraryExercise } from '@/exercises/library';
import { setKindOf, type SetField, type SetKind } from '@/sessions/fields';
import { AddSetButton, SetHeader, SetLine, setButtonStyle } from '@/sessions/set-table';
import { fonts, useTheme } from '@/theme';
import { useWorkoutName } from '@/workouts/format';
import { useWorkouts } from '@/workouts/workouts';

import {
  useEditLog,
  useLoggedSets,
  useLogSummary,
  type LoggedExercise,
  type LogSummary,
  type SetValues,
  withSkipped,
} from './history';

type EditedSet = SetValues & { key: number };
type EditedExercise = { place: number; exerciseId: string; sets: EditedSet[] };

const EMPTY: SetValues = { weightKg: null, reps: null, seconds: null, meters: null };

/** The values a set still needs before it can be saved, as its exercise records them. */
export function missingFields(set: SetValues, kind: SetKind): SetField[] {
  if (kind.fields.includes('reps')) {
    return [
      ...(set.weightKg === null && !kind.addedWeight ? (['weightKg'] as const) : []),
      ...(set.reps === null ? (['reps'] as const) : []),
    ];
  }
  // A time or a distance, whichever the exercise records.
  return set.seconds === null && set.meters === null ? kind.fields : [];
}

/** Corrects the sets of a finished workout: their values, and which sets there were. */
export function EditLogScreen({ id }: { id: number }) {
  const { t } = useTranslation();
  const summary = useLogSummary(id);
  const sets = useLoggedSets(id);
  const library = useExerciseLibrary();
  const workouts = useWorkouts();

  if (!allLoaded([summary, sets, library, workouts])) {
    return (
      <Screen onBack={() => router.back()} closes>
        <LoadState queries={[summary, sets, library, workouts]} />
      </Screen>
    );
  }
  if (!summary.data) {
    return (
      <Screen onBack={() => router.back()} closes>
        <MessageView
          icon="dumbbell"
          title={t('history.notFound.title')}
          message={t('history.notFound.message')}
        />
      </Screen>
    );
  }
  const log = summary.data;
  // The exercises the workout had, so that a skipped one can get sets afterwards. Logs saved before
  // they were kept take them from the workout as it is now, as many as it had then.
  const workout = workouts.data?.find((item) => item.id === log.workoutId);
  const planned =
    log.plannedExerciseIds ??
    (workout?.exercises ?? [])
      .slice(0, log.plannedExercises ?? undefined)
      .map((exercise) => exercise.exerciseId);
  return (
    <LogEditor
      log={log}
      exercises={withSkipped(sets.data ?? [], planned)}
      library={library.data ?? []}
    />
  );
}

function LogEditor({
  log,
  exercises: initial,
  library,
}: {
  log: LogSummary;
  exercises: LoggedExercise[];
  library: LibraryExercise[];
}) {
  const { t, i18n } = useTranslation();
  const { colors, radii, spacing } = useTheme();
  const workoutName = useWorkoutName();
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

  // Leaving with changes asks first, whether with the close button or the system's back.
  const valuesOf = (list: EditedExercise[]) =>
    JSON.stringify(list.map((exercise) => exercise.sets.map(({ key: _key, ...values }) => values)));
  const changed = valuesOf(exercises) !== valuesOf(original);
  // How the screen is left once it may be: after saving, or discarding the changes. It runs once
  // the screen no longer holds on to them.
  const [leave, setLeave] = useState<(() => void) | null>(null);
  usePreventRemove(changed && leave === null, ({ repeat }) =>
    Alert.alert(t('history.edit.discardTitle'), t('history.edit.discardMessage'), [
      { text: t('history.edit.keepEditing'), style: 'cancel' },
      {
        text: t('session.summary.discard'),
        style: 'destructive',
        onPress: () => setLeave(() => repeat),
      },
    ]),
  );
  useEffect(() => leave?.(), [leave]);

  const details = (exerciseId: string) => library.find((item) => item.id === exerciseId);
  const kindOf = (exerciseId: string) =>
    setKindOf(details(exerciseId)?.metrics, { reps: { min: 1, max: 1 } });
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

  const onSave = async () => {
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
      setLeave(() => () => router.back());
    } catch (error) {
      console.warn('Could not save the workout log', error);
      Alert.alert(
        t('history.edit.saveErrorTitle'),
        (error as { code?: string }).code === 'BB013'
          ? t('history.notFound.message')
          : t('history.edit.saveError'),
      );
    }
  };

  const day = new Intl.DateTimeFormat(i18n.language, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: log.startedAt.getFullYear() === new Date().getFullYear() ? undefined : 'numeric',
  }).format(log.startedAt);
  const time = new Intl.DateTimeFormat(i18n.language, { timeStyle: 'short' });
  const canSave = setCount > 0 && !edit.isPending;

  return (
    <Screen
      onBack={() => router.back()}
      closes
      title={
        <Text variant="bodyStrong" accessibilityRole="header" numberOfLines={1} style={styles.bold}>
          {t('history.edit.title', { name: workoutName(log) })}
        </Text>
      }
      action={
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: !canSave }}
          disabled={!canSave}
          onPress={() => void onSave()}
          style={[
            styles.save,
            {
              borderRadius: radii.full,
              paddingHorizontal: spacing.lg,
              backgroundColor: canSave ? colors.primaryButton : colors.track,
            },
          ]}
        >
          <Text
            variant="bodyStrong"
            color={canSave ? 'onPrimary' : 'textMuted'}
            style={styles.bold}
          >
            {t('editor.save')}
          </Text>
        </Pressable>
      }
    >
      <Text variant="caption" color="textMuted" style={styles.semibold}>
        {`${day} · ${time.format(log.startedAt)}–${time.format(log.finishedAt)}. ${t('history.edit.note')}`}
      </Text>
      {setCount === 0 ? (
        <Text color="danger" style={styles.semibold}>
          {t('history.edit.empty')}
        </Text>
      ) : checked && incomplete ? (
        <Text color="danger" style={styles.semibold}>
          {t('history.edit.missing')}
        </Text>
      ) : null}

      {exercises.map((exercise, index) => {
        const info = details(exercise.exerciseId);
        const kind = kindOf(exercise.exerciseId);
        return (
          <View
            key={index}
            style={[
              styles.card,
              {
                gap: spacing.sm,
                padding: spacing.md,
                borderRadius: radii.lg,
                borderColor: colors.border,
                backgroundColor: colors.surface,
              },
            ]}
          >
            <View style={[styles.row, { gap: spacing.md }]}>
              <ExerciseThumbnail path={info?.imagePaths[0]} size={40} />
              <View style={styles.flex}>
                <Text variant="bodyStrong" style={styles.bold}>
                  {info?.name ?? ''}
                </Text>
                {exercise.sets.length === 0 ? (
                  <Text variant="caption" color="textMuted" style={styles.semibold}>
                    {t('session.summary.skipped')}
                  </Text>
                ) : null}
              </View>
            </View>
            {exercise.sets.length > 0 ? <SetHeader kind={kind} showLast={false} /> : null}
            {exercise.sets.map((set, setIndex) => (
              <SetLine
                key={set.key}
                number={setIndex + 1}
                kind={kind}
                values={set}
                muted={false}
                invalid={checked ? missingFields(set, kind) : []}
                onChange={(values) =>
                  changeSets(index, (current) =>
                    current.map((item) => (item.key === set.key ? { ...item, ...values } : item)),
                  )
                }
                button={
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t('history.edit.removeSet', { number: setIndex + 1 })}
                    onPress={() =>
                      changeSets(index, (current) => current.filter((item) => item.key !== set.key))
                    }
                    style={[setButtonStyle, { backgroundColor: colors.background }]}
                  >
                    <Icon name="minus" size={16} color="textMuted" />
                  </Pressable>
                }
              />
            ))}
            <AddSetButton
              count={exercise.sets.length}
              onPress={() =>
                setExercises((current) => {
                  // A new set repeats the one before it, like during a workout.
                  const key = Math.max(
                    -1,
                    ...current.flatMap((item) => item.sets.map((s) => s.key)),
                  );
                  return current.map((item, i) => {
                    if (i !== index) {
                      return item;
                    }
                    const { key: _key, ...values } = item.sets[item.sets.length - 1] ?? {
                      ...EMPTY,
                      key: 0,
                    };
                    return { ...item, sets: [...item.sets, { ...values, key: key + 1 }] };
                  });
                })
              }
            />
          </View>
        );
      })}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  bold: {
    fontFamily: fonts.extraBold,
  },
  semibold: {
    fontFamily: fonts.bold,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  card: {
    borderWidth: 1,
  },
  save: {
    height: 40,
    justifyContent: 'center',
  },
});
