import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { Switch } from '@/components/ui/switch';
import { Text } from '@/components/ui/text';
import { fonts, useTheme } from '@/theme';

import { DayChips } from './day-chips';
import { useSetWorkoutActive, type Workout } from './workouts';

type WorkoutListItemProps = {
  workout: Workout;
  /** Whether the workout is planned for today, which is highlighted. */
  today?: boolean;
};

/** A workout in a list: its name, days and size, with a switch to turn it on or off. */
export function WorkoutListItem({ workout, today = false }: WorkoutListItemProps) {
  const { t } = useTranslation();
  const { colors, radii, spacing } = useTheme();
  const setActive = useSetWorkoutActive();
  const name = t(`workout.sessionTypes.${workout.type}`);

  return (
    <View
      style={[
        styles.card,
        {
          gap: spacing.md,
          padding: spacing.lg,
          borderRadius: radii.lg,
          backgroundColor: colors.surface,
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
  pill: {
    paddingHorizontal: 8,
    paddingVertical: 1,
  },
  pillText: {
    fontFamily: fonts.extraBold,
  },
});
