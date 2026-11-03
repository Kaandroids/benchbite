import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { Card } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { IconStat } from '@/components/ui/icon-stat';
import { Switch } from '@/components/ui/switch';
import { Tag } from '@/components/ui/tag';
import { Text } from '@/components/ui/text';
import { useTheme } from '@/theme';

import { DayChips } from './day-chips';
import { useWorkoutName } from './format';
import { HeldWorkoutSheet } from './held-workout-sheet';
import {
  HELD_OPACITY,
  showsAsWaiting,
  useKcalPerMinute,
  useSetWorkoutActive,
  type Workout,
} from './workouts';

type WorkoutListItemProps = {
  workout: Workout;
  /** Today's ISO weekday: when the workout is planned on it, its day and start button stand out. */
  today?: number;
  /** Whether this workout is in progress, which replaces its start button. */
  running?: boolean;
  onStart?: () => void;
};

/**
 * A workout in a list: its name, days and size, with a button to start it while it is active and a
 * switch to turn it back on while it is not. Active workouts are switched off on their own screen.
 * One that waits for premium is dimmed and locked in its place, and opens a sheet that says so.
 */
export function WorkoutListItem({
  workout,
  today,
  running = false,
  onStart,
}: WorkoutListItemProps) {
  const { t } = useTranslation();
  const { colors, radii, spacing } = useTheme();
  const setActive = useSetWorkoutActive();
  const name = useWorkoutName()(workout);
  const { data: kcalPerMinute } = useKcalPerMinute();
  const { exercises } = workout;
  const sets = exercises.reduce((total, exercise) => total + exercise.sets, 0);
  const isToday = today !== undefined && workout.weekdays.includes(today);
  const held = showsAsWaiting(workout, running);
  const [showingHeld, setShowingHeld] = useState(false);
  // Muted as an archived one, as neither is planned on a day.
  const muted = !workout.active || held;

  return (
    <Card style={[styles.card, { padding: spacing.lg }]}>
      <Pressable
        accessibilityRole="button"
        // The day chips sit inside this button, so it says itself when it is today's.
        accessibilityLabel={
          held
            ? t('workout.held.label', { name })
            : isToday
              ? t('workout.todayLabel', { name })
              : name
        }
        onPress={() =>
          held
            ? setShowingHeld(true)
            : router.push({ pathname: '/workout/[id]', params: { id: String(workout.id) } })
        }
        style={({ pressed }) => [
          styles.body,
          { gap: spacing.xs, opacity: (held ? HELD_OPACITY : 1) * (pressed ? 0.6 : 1) },
        ]}
      >
        <Text variant="headline" color={muted ? 'textMuted' : 'text'}>
          {name}
        </Text>
        <DayChips weekdays={workout.weekdays} muted={muted} today={held ? undefined : today} />
        {/* One line: the counts go without their words, which the icons and labels give. Only the
            calories keep a colour, so that the stats stay quiet beside the days (#334). */}
        {exercises.length === 0 ? (
          <Text variant="caption" color="textMuted">
            {t('workout.noExercises')}
          </Text>
        ) : (
          <View style={[styles.stats, { gap: spacing.md }]}>
            <IconStat
              icon="dumbbell"
              color="textMuted"
              text={String(exercises.length)}
              label={t('workout.size.exercises', { count: exercises.length })}
            />
            <IconStat
              icon="target"
              color="textMuted"
              text={String(sets)}
              label={t('common.sets', { count: sets })}
            />
            <IconStat
              icon="timer"
              color="textMuted"
              text={t('workout.size.minutes', { minutes: workout.estimatedMinutes })}
            />
            {kcalPerMinute ? (
              <IconStat
                icon="flame"
                color="primary"
                text={t('workout.size.kcal', {
                  kcal: Math.round(kcalPerMinute * workout.estimatedMinutes),
                })}
              />
            ) : null}
          </View>
        )}
      </Pressable>
      {held ? (
        // Centred as the start button is, which the tag otherwise tops.
        <View style={styles.tag}>
          <Tag label={t('workout.held.tag')} icon="lock" />
        </View>
      ) : running ? (
        <View style={[styles.running, { borderRadius: radii.full, backgroundColor: colors.track }]}>
          <Text variant="captionStrong" color="textMuted">
            {t('session.running')}
          </Text>
        </View>
      ) : workout.active ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('workout.startLabel', { name })}
          onPress={onStart}
          style={({ pressed }) => [
            styles.start,
            {
              borderRadius: radii.full,
              // Only today's is orange, so that it stands out from the others.
              backgroundColor: isToday ? colors.iconBackground : colors.track,
              opacity: pressed ? 0.6 : 1,
            },
          ]}
        >
          <Icon name="play" size={22} color={isToday ? 'primary' : 'text'} />
        </Pressable>
      ) : (
        <Switch
          accessibilityLabel={t('workout.activeLabel', { name })}
          value={workout.active}
          onValueChange={(active) => setActive.mutate({ id: workout.id, active })}
        />
      )}
      {showingHeld ? (
        <HeldWorkoutSheet workout={workout} onClose={() => setShowingHeld(false)} />
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  body: {
    flex: 1,
  },
  stats: {
    flexDirection: 'row',
  },
  start: {
    width: 52,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tag: {
    justifyContent: 'center',
  },
  running: {
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
});
