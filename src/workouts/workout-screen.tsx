import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { allLoaded, LoadState } from '@/components/load-state';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { MessageView } from '@/components/ui/message-view';
import { PillButton } from '@/components/ui/pill-button';
import { Screen } from '@/components/ui/screen';
import { StatColumns } from '@/components/ui/stat-columns';
import { afterSheetCloses } from '@/components/ui/sheet';
import { Text } from '@/components/ui/text';
import { ExerciseThumbnail } from '@/exercises/exercise-thumbnail';
import { HistoryButton } from '@/exercises/history-button';
import { InfoButton } from '@/exercises/info-button';
import { useExerciseLibrary, findExercise } from '@/exercises/library';
import { useUserId } from '@/providers/session-provider';
import { BusySheet } from '@/sessions/busy-sheet';
import { endSession, useActiveSession } from '@/sessions/session';
import { useStartWorkout } from '@/sessions/start';
import { useTheme } from '@/theme';

import { DayChips } from './day-chips';
import { mainMuscles, useRestFormat, useTargetFormat, useWorkoutName } from './format';
import {
  useDeleteWorkout,
  useKcalPerMinute,
  useSetWorkoutActive,
  useWorkouts,
  type Workout,
  type WorkoutExercise,
} from './workouts';

const IMAGE_SIZE = 60;

/** A workout with every exercise's picture, target and rest. */
export function WorkoutScreen({ id }: { id: number }) {
  const { t } = useTranslation();
  const { colors, radii, spacing } = useTheme();
  const workouts = useWorkouts();
  const setActive = useSetWorkoutActive();
  const session = useActiveSession(useUserId());
  const { data: kcalPerMinute } = useKcalPerMinute();
  const startWorkout = useStartWorkout();
  const remove = useDeleteWorkout();
  const [waiting, setWaiting] = useState<Workout | null>(null);
  const workout = workouts.data?.find((candidate) => candidate.id === id);
  // From the library, which loads again when the user renames an exercise of their own.
  const library = useExerciseLibrary();
  const nameOf = (exerciseId: string) => findExercise(library.data, exerciseId)?.name ?? '';
  const formatTarget = useTargetFormat();
  const formatRest = useRestFormat();
  const workoutName = useWorkoutName();

  if (!allLoaded([workouts])) {
    return (
      <Screen onBack={() => router.back()}>
        <LoadState queries={[workouts]} />
      </Screen>
    );
  }
  if (!workout) {
    return (
      <Screen onBack={() => router.back()}>
        <MessageView
          icon="dumbbell"
          title={t('workout.notFound.title')}
          message={t('workout.notFound.message')}
        />
      </Screen>
    );
  }

  const name = workoutName(workout);
  const sets = workout.exercises.reduce((total, exercise) => total + exercise.sets, 0);
  const stats = [
    {
      value: workout.exercises.length,
      label: t('workout.stats.exercises', { count: workout.exercises.length }),
    },
    { value: sets, label: t('workout.stats.sets', { count: sets }) },
    { value: `~${workout.estimatedMinutes}`, label: t('workout.stats.minutes') },
    ...(kcalPerMinute
      ? [{ value: `~${Math.round(kcalPerMinute * workout.estimatedMinutes)}`, label: 'kcal' }]
      : []),
  ];

  const row = (exercise: WorkoutExercise, key: string, divider: boolean) => (
    <View
      key={key}
      style={[
        styles.exercise,
        {
          gap: spacing.md,
          paddingVertical: spacing.md,
          borderTopWidth: divider ? 1 : 0,
          borderTopColor: colors.border,
        },
      ]}
    >
      <ExerciseThumbnail
        path={exercise.imagePath}
        size={IMAGE_SIZE}
        name={nameOf(exercise.exerciseId)}
      />
      <View style={[styles.exerciseText, { gap: 2 }]}>
        <Text variant="bodyStrong">{nameOf(exercise.exerciseId)}</Text>
        <Text variant="bodyStrong" color="primaryText">
          {formatTarget(exercise.sets, exercise.target)}
        </Text>
        <Text variant="caption" color="textMuted">
          {formatRest(exercise.restSeconds)}
        </Text>
      </View>
      <View style={{ gap: spacing.sm }}>
        <InfoButton exerciseId={exercise.exerciseId} exerciseName={nameOf(exercise.exerciseId)} />
        <HistoryButton
          exerciseId={exercise.exerciseId}
          exerciseName={nameOf(exercise.exerciseId)}
        />
      </View>
    </View>
  );

  // A workout that is running cannot change under it, nor be deleted before it is saved; it is
  // finished first.
  const running = session?.workoutId === workout.id;
  const askToFinish = () =>
    Alert.alert(t('workout.running.title', { name }), t('workout.running.message'), [
      { text: t('editor.cancel'), style: 'cancel' },
      { text: t('workout.running.resume'), onPress: () => router.push('/session') },
    ]);

  const start = () => {
    if (running) {
      router.push('/session');
    } else if (session) {
      setWaiting(workout);
    } else {
      void startWorkout(workout);
    }
  };

  const onDelete = () => {
    if (running) {
      askToFinish();
      return;
    }
    Alert.alert(t('editor.deleteTitle'), t('editor.deleteMessage'), [
      { text: t('editor.cancel'), style: 'cancel' },
      {
        text: t('editor.delete'),
        style: 'destructive',
        onPress: () => {
          // Back first, so that the deleted workout never shows as not found.
          router.back();
          remove.mutateAsync(workout.id).catch((error: unknown) => {
            console.warn('Could not delete the workout', error);
            Alert.alert(t('history.deleteErrorTitle'), t('history.deleteError'));
          });
        },
      },
    ]);
  };

  return (
    <Screen
      onBack={() => router.back()}
      title={
        <>
          <Text variant="label" accessibilityRole="header" numberOfLines={1}>
            {name}
          </Text>
          <Text variant="caption" color="textMuted" numberOfLines={1}>
            {mainMuscles(workout)
              .map((muscle) => t(`workout.muscles.${muscle}`))
              .join(' · ')}
          </Text>
        </>
      }
      footer={
        workout.active ? (
          <Button
            label={running ? t('session.resume') : t('workout.startWorkout')}
            onPress={start}
          />
        ) : undefined
      }
      action={
        <PillButton
          label={t('workout.edit')}
          onPress={() => {
            if (running) {
              askToFinish();
              return;
            }
            router.push({ pathname: '/workout/edit', params: { id: String(workout.id) } });
          }}
        />
      }
    >
      {/* One card of even columns over the workout's days, like a finished workout's figures over
          when it started and ended. */}
      <StatColumns
        stats={stats}
        footer={
          <View style={[styles.days, { gap: spacing.sm }]}>
            <Text variant="caption" color="textMuted">
              {t('workout.days')}
            </Text>
            <DayChips weekdays={workout.weekdays} muted={!workout.active} />
          </View>
        }
      />

      <Card>
        <View>
          {workout.exercises.map((exercise, index) =>
            row(exercise, `${exercise.exerciseId}-${index}`, index > 0),
          )}
        </View>
      </Card>

      {/* Switching a workout off moves it to the archive, and back. */}
      <Pressable
        accessibilityRole="button"
        onPress={() => setActive.mutate({ id: workout.id, active: !workout.active })}
        style={({ pressed }) => [
          styles.archive,
          {
            gap: spacing.sm,
            borderRadius: radii.lg,
            borderColor: colors.border,
            backgroundColor: colors.surface,
            opacity: pressed ? 0.6 : 1,
          },
        ]}
      >
        <Icon name="archive" size={20} color={workout.active ? 'textMuted' : 'primaryText'} />
        <Text variant="label" color={workout.active ? 'text' : 'primaryText'}>
          {workout.active ? t('workout.toArchive') : t('workout.fromArchive')}
        </Text>
      </Pressable>
      <Pressable accessibilityRole="button" onPress={onDelete} style={styles.delete}>
        <Text variant="label" color="danger">
          {t('editor.delete')}
        </Text>
      </Pressable>

      {session ? (
        <BusySheet
          session={session}
          next={waiting}
          onResume={() => {
            setWaiting(null);
            router.push('/session');
          }}
          onFinish={() => {
            setWaiting(null);
            router.push({ pathname: '/session/finish', params: { next: String(workout.id) } });
          }}
          onDiscard={() => {
            setWaiting(null);
            // The running workout ends only once the new one is sure to start, which may ask first.
            afterSheetCloses(() => void startWorkout(workout, { beforeStart: endSession }));
          }}
          onClose={() => setWaiting(null)}
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  archive: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  delete: {
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  days: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  exercise: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  exerciseText: {
    flex: 1,
  },
});
