import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { allLoaded, LoadState } from '@/components/load-state';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { InfoButton } from '@/components/ui/info-button';
import { MessageView } from '@/components/ui/message-view';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { ExerciseThumbnail } from '@/exercises/exercise-thumbnail';
import { BusySheet } from '@/sessions/busy-sheet';
import { endSession, useActiveSession } from '@/sessions/session';
import { useStartWorkout, useUserId } from '@/sessions/start';
import { useExerciseNames } from '@/exercises/use-exercise-names';
import { fonts, useTheme } from '@/theme';

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
  const names = useExerciseNames(workout?.exercises.map((exercise) => exercise.exerciseId) ?? []);
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
      <ExerciseThumbnail path={exercise.imagePath} size={IMAGE_SIZE} />
      <View style={[styles.exerciseText, { gap: 2 }]}>
        <Text variant="bodyStrong">{names[exercise.exerciseId] ?? ''}</Text>
        <Text variant="bodyStrong" color="primaryText">
          {formatTarget(exercise.sets, exercise.target)}
        </Text>
        <Text variant="caption" color="textMuted">
          {formatRest(exercise.restSeconds)}
        </Text>
      </View>
      <InfoButton
        exerciseId={exercise.exerciseId}
        exerciseName={names[exercise.exerciseId] ?? ''}
      />
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
          <Text
            variant="bodyStrong"
            accessibilityRole="header"
            numberOfLines={1}
            style={styles.bold}
          >
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
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            if (running) {
              askToFinish();
              return;
            }
            router.push({ pathname: '/workout/edit', params: { id: String(workout.id) } });
          }}
          style={({ pressed }) => [
            styles.edit,
            {
              gap: spacing.xs,
              borderRadius: radii.full,
              backgroundColor: colors.iconBackground,
              paddingHorizontal: spacing.md,
              opacity: pressed ? 0.6 : 1,
            },
          ]}
        >
          <Icon name="edit" size={16} color="primaryText" />
          <Text variant="bodyStrong" color="primaryText" style={styles.bold}>
            {t('workout.edit')}
          </Text>
        </Pressable>
      }
    >
      <DayChips weekdays={workout.weekdays} muted={!workout.active} />

      {/* One card of even columns, like a finished workout's figures. */}
      <View
        style={[
          styles.stats,
          {
            paddingVertical: spacing.md,
            borderRadius: radii.lg,
            backgroundColor: colors.surface,
            borderColor: colors.border,
          },
        ]}
      >
        {stats.map((stat, index) => (
          <View
            key={stat.label}
            style={[
              styles.stat,
              { borderLeftWidth: index > 0 ? 1 : 0, borderLeftColor: colors.border },
            ]}
          >
            <Text variant="headline">{stat.value}</Text>
            <Text variant="caption" color="textMuted">
              {stat.label}
            </Text>
          </View>
        ))}
      </View>

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
        <Text
          variant="bodyStrong"
          color={workout.active ? 'text' : 'primaryText'}
          style={styles.bold}
        >
          {workout.active ? t('workout.toArchive') : t('workout.fromArchive')}
        </Text>
      </Pressable>
      <Pressable accessibilityRole="button" onPress={onDelete} style={styles.delete}>
        <Text variant="bodyStrong" color="danger" style={styles.bold}>
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
            endSession();
            void startWorkout(workout);
          }}
          onClose={() => setWaiting(null)}
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  edit: {
    height: 40,
    flexDirection: 'row',
    alignItems: 'center',
  },
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
  stats: {
    flexDirection: 'row',
    borderWidth: 1,
  },
  stat: {
    flex: 1,
    alignItems: 'center',
  },
  exercise: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  exerciseText: {
    flex: 1,
  },
  bold: {
    fontFamily: fonts.extraBold,
  },
});
