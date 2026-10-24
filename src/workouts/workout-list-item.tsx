import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { Card } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { IconStat } from '@/components/ui/icon-stat';
import { Switch } from '@/components/ui/switch';
import { Text } from '@/components/ui/text';
import { useTheme } from '@/theme';

import { DayChips } from './day-chips';
import { useWorkoutName } from './format';
import { useKcalPerMinute, useSetWorkoutActive, type Workout } from './workouts';

type WorkoutListItemProps = {
  workout: Workout;
  /** Whether the workout is planned for today, which is highlighted. */
  today?: boolean;
  /** Whether this workout is in progress, which replaces its start button. */
  running?: boolean;
  onStart?: () => void;
};

/**
 * A workout in a list: its name, days and size, with a button to start it while it is active and a
 * switch to turn it back on while it is not. Active workouts are switched off on their own screen.
 */
export function WorkoutListItem({
  workout,
  today = false,
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

  return (
    <Card
      style={[
        styles.card,
        {
          padding: spacing.lg,
          borderColor: today ? colors.primary : colors.border,
          borderWidth: today ? 2 : 1,
        },
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={name}
        onPress={() =>
          router.push({ pathname: '/workout/[id]', params: { id: String(workout.id) } })
        }
        style={({ pressed }) => [styles.body, { gap: spacing.xs, opacity: pressed ? 0.6 : 1 }]}
      >
        <View style={[styles.row, { gap: spacing.sm }]}>
          <Text
            variant="headline"
            color={workout.active ? 'text' : 'textMuted'}
            style={styles.name}
          >
            {name}
          </Text>
          {today ? (
            <View
              style={[
                styles.pill,
                { borderRadius: radii.full, backgroundColor: colors.primaryButton },
              ]}
            >
              <Text variant="captionStrong" color="onPrimary">
                {t('workout.today')}
              </Text>
            </View>
          ) : null}
        </View>
        <DayChips weekdays={workout.weekdays} muted={!workout.active} />
        {/* One line: the counts go without their words, which the icons and labels give. */}
        <View style={[styles.stats, { gap: spacing.md }]}>
          <IconStat
            icon="dumbbell"
            color="info"
            text={String(exercises.length)}
            label={t('workout.size.exercises', { count: exercises.length })}
          />
          <IconStat
            icon="target"
            color="fat"
            text={String(sets)}
            label={t('history.sets', { count: sets })}
          />
          <IconStat
            icon="timer"
            color="primaryText"
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
      </Pressable>
      {running ? (
        <View
          style={[
            styles.pill,
            styles.running,
            { borderRadius: radii.full, backgroundColor: colors.track },
          ]}
        >
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
              backgroundColor: colors.iconBackground,
              opacity: pressed ? 0.6 : 1,
            },
          ]}
        >
          <Icon name="play" size={22} color="primaryText" />
        </Pressable>
      ) : (
        <Switch
          accessibilityLabel={t('workout.activeLabel', { name })}
          value={workout.active}
          onValueChange={(active) => setActive.mutate({ id: workout.id, active })}
        />
      )}
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
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  stats: {
    flexDirection: 'row',
  },
  // Long names wrap and leave room for the Today pill instead of pushing it out.
  name: {
    flexShrink: 1,
  },
  start: {
    width: 52,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pill: {
    paddingHorizontal: 8,
    paddingVertical: 1,
  },
  running: {
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
});
