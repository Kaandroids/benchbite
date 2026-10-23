import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { allLoaded, LoadState } from '@/components/load-state';
import { Card } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { InfoButton } from '@/components/ui/info-button';
import { MessageView } from '@/components/ui/message-view';
import { Screen } from '@/components/ui/screen';
import { Switch } from '@/components/ui/switch';
import { Text } from '@/components/ui/text';
import { ExerciseThumbnail } from '@/exercises/exercise-thumbnail';
import { useActiveSession } from '@/sessions/session';
import { useUserId } from '@/sessions/start';
import { useExerciseNames } from '@/exercises/use-exercise-names';
import { fonts, useTheme } from '@/theme';

import { DayChips } from './day-chips';
import { mainMuscles, useRestFormat, useTargetFormat, useWorkoutName } from './format';
import {
  useKcalPerMinute,
  useSetWorkoutActive,
  useWorkouts,
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

  return (
    <Screen
      onBack={() => router.back()}
      action={
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            // A workout that is running cannot change under it, nor be deleted before it is
            // saved; it is finished first.
            if (session?.workoutId === workout.id) {
              Alert.alert(t('workout.running.title', { name }), t('workout.running.message'), [
                { text: t('editor.cancel'), style: 'cancel' },
                { text: t('workout.running.resume'), onPress: () => router.push('/session') },
              ]);
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
    </Screen>
  );
}

const styles = StyleSheet.create({
  edit: {
    height: 40,
    flexDirection: 'row',
    alignItems: 'center',
  },
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
