import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Image, StyleSheet, View } from 'react-native';

import { allLoaded, LoadState } from '@/components/load-state';
import { Card } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { MessageView } from '@/components/ui/message-view';
import { Screen } from '@/components/ui/screen';
import { Switch } from '@/components/ui/switch';
import { Text } from '@/components/ui/text';
import { useExerciseNames } from '@/exercises/use-exercise-names';
import { fonts, useTheme } from '@/theme';

import { DayChips } from './day-chips';
import { mainMuscles, useRestFormat, useTargetFormat, useWorkoutName } from './format';
import {
  exerciseImageUrl,
  useSetWorkoutActive,
  useWorkouts,
  type WorkoutExercise,
} from './workouts';

const IMAGE_SIZE = 60;

/** A workout with every exercise's picture, target and rest, and its finisher. */
export function WorkoutScreen({ id }: { id: number }) {
  const { t } = useTranslation();
  const { colors, radii, spacing } = useTheme();
  const workouts = useWorkouts();
  const setActive = useSetWorkoutActive();
  const workout = workouts.data?.find((candidate) => candidate.id === id);
  const all = workout
    ? [...workout.exercises, ...(workout.finisher ? [workout.finisher] : [])]
    : [];
  const names = useExerciseNames(all.map((exercise) => exercise.exerciseId));
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
  ];

  const row = (exercise: WorkoutExercise, number: number | null, divider: boolean) => (
    <View
      key={`${exercise.exerciseId}-${number}`}
      style={[
        styles.exercise,
        {
          gap: spacing.md,
          paddingVertical: spacing.md,
          borderTopWidth: divider ? StyleSheet.hairlineWidth : 0,
          borderTopColor: colors.border,
        },
      ]}
    >
      {number !== null ? (
        <Text variant="caption" color="textMuted" style={styles.number}>
          {number}
        </Text>
      ) : null}
      <View
        style={[
          styles.image,
          {
            borderRadius: radii.md,
            borderColor: colors.border,
            backgroundColor: colors.imageBackground,
          },
        ]}
      >
        {exercise.imagePath ? (
          <Image
            source={{ uri: exerciseImageUrl(exercise.imagePath) }}
            style={styles.imageFill}
            accessibilityIgnoresInvertColors
          />
        ) : null}
      </View>
      <View style={[styles.exerciseText, { gap: 2 }]}>
        <Text variant="bodyStrong">{names[exercise.exerciseId] ?? ''}</Text>
        <Text variant="bodyStrong" color="primaryText">
          {formatTarget(exercise.sets, exercise.target)}
        </Text>
        <Text variant="caption" color="textMuted">
          {formatRest(exercise.restSeconds)}
        </Text>
      </View>
    </View>
  );

  return (
    <Screen onBack={() => router.back()}>
      <View style={[styles.header, { gap: spacing.md }]}>
        <View style={[styles.headerText, { gap: spacing.xs }]}>
          <Text variant="title" accessibilityRole="header">
            {name}
          </Text>
          <DayChips weekdays={workout.weekdays} muted={!workout.active} />
          <Text color="textMuted">
            {mainMuscles(workout)
              .map((muscle) => t(`workout.muscles.${muscle}`))
              .join(' · ')}
          </Text>
        </View>
        <View style={[styles.switch, { gap: spacing.xs }]}>
          <Switch
            accessibilityLabel={t('workout.activeLabel', { name })}
            value={workout.active}
            onValueChange={(active) => setActive.mutate({ id: workout.id, active })}
          />
          <Text variant="caption" color="textMuted">
            {workout.active ? t('workout.active') : t('workout.inactive')}
          </Text>
        </View>
      </View>

      <View style={[styles.stats, { gap: spacing.sm }]}>
        {stats.map((stat) => (
          <View
            key={stat.label}
            style={[
              styles.stat,
              {
                borderRadius: radii.md,
                backgroundColor: colors.surface,
                borderColor: colors.border,
                padding: spacing.sm,
              },
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
          {workout.exercises.map((exercise, index) => row(exercise, index + 1, index > 0))}
        </View>
      </Card>

      {workout.finisher ? (
        <Card>
          <View style={[styles.finisherTitle, { gap: spacing.sm }]}>
            <Icon name="flame" size={20} color="primary" />
            <Text variant="bodyStrong" style={styles.finisherLabel}>
              {t('workout.finisher.title')}
            </Text>
            <Text variant="caption" color="textMuted">
              {t('workout.finisher.body')}
            </Text>
          </View>
          {row(workout.finisher, null, false)}
        </Card>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  headerText: {
    flex: 1,
  },
  switch: {
    alignItems: 'center',
    paddingTop: 4,
  },
  stats: {
    flexDirection: 'row',
  },
  stat: {
    flex: 1,
    alignItems: 'center',
    borderWidth: 1,
  },
  exercise: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  number: {
    width: 16,
    fontFamily: fonts.extraBold,
  },
  image: {
    width: IMAGE_SIZE,
    height: IMAGE_SIZE,
    borderWidth: 1,
    overflow: 'hidden',
  },
  imageFill: {
    width: '100%',
    height: '100%',
  },
  exerciseText: {
    flex: 1,
  },
  finisherTitle: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  finisherLabel: {
    fontFamily: fonts.extraBold,
  },
});
