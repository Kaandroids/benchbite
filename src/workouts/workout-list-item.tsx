import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { Switch } from '@/components/ui/switch';
import { Text } from '@/components/ui/text';
import { fonts, useTheme } from '@/theme';

import { DayChips } from './day-chips';
import { useWorkoutName } from './format';
import { useSetWorkoutActive, type Workout } from './workouts';

type WorkoutListItemProps = {
  workout: Workout;
  /** Whether the workout is planned for today, which is highlighted. */
  today?: boolean;
};

/**
 * A workout in a list: its name, days and size, with a switch to turn it on or off and, while it
 * is active, a button to start it.
 */
export function WorkoutListItem({ workout, today = false }: WorkoutListItemProps) {
  const { t } = useTranslation();
  const { colors, radii, spacing } = useTheme();
  const setActive = useSetWorkoutActive();
  const name = useWorkoutName()(workout);

  return (
    <View
      style={[
        styles.card,
        {
          borderRadius: radii.lg,
          backgroundColor: colors.surface,
          borderColor: today ? colors.primary : colors.border,
          borderWidth: today ? 2 : 1,
        },
      ]}
    >
      <View style={[styles.top, { gap: spacing.md, padding: spacing.lg }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={name}
          onPress={() =>
            router.push({ pathname: '/workout/[id]', params: { id: String(workout.id) } })
          }
          style={({ pressed }) => [styles.body, { gap: spacing.xs, opacity: pressed ? 0.6 : 1 }]}
        >
          <View style={[styles.row, { gap: spacing.sm }]}>
            <Text variant="headline" color={workout.active ? 'text' : 'textMuted'}>
              {name}
            </Text>
            {today ? (
              <View
                style={[
                  styles.pill,
                  { borderRadius: radii.full, backgroundColor: colors.primaryButton },
                ]}
              >
                <Text variant="caption" color="onPrimary" style={styles.pillText}>
                  {t('workout.today')}
                </Text>
              </View>
            ) : null}
          </View>
          <DayChips weekdays={workout.weekdays} muted={!workout.active} />
          <Text variant="caption" color="textMuted">
            {t('workout.session', {
              count: workout.exercises.length,
              minutes: workout.estimatedMinutes,
            })}
          </Text>
        </Pressable>
        <Switch
          accessibilityLabel={t('workout.activeLabel', { name })}
          value={workout.active}
          onValueChange={(active) => setActive.mutate({ id: workout.id, active })}
        />
      </View>
      {workout.active ? (
        // Starting a workout comes with logging it (#78).
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('workout.startLabel', { name })}
          style={({ pressed }) => [
            styles.start,
            {
              borderTopColor: colors.border,
              backgroundColor: colors.background,
              opacity: pressed ? 0.6 : 1,
            },
          ]}
        >
          <Text variant="bodyStrong" style={styles.pillText}>
            {t('workout.start')}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    overflow: 'hidden',
  },
  top: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  body: {
    flex: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  start: {
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  pill: {
    paddingHorizontal: 8,
    paddingVertical: 1,
  },
  pillText: {
    fontFamily: fonts.extraBold,
  },
});
