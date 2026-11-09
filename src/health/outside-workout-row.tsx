import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { DateTile } from '@/components/ui/date-tile';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { useDurationFormat } from '@/i18n/dates';
import { useNumberFormat } from '@/i18n/units';
import { useTheme } from '@/theme';

import { ACTIVITY_ICONS } from './activities';
import type { ListedOutsideWorkout } from './outside-workouts';

/** How long a workout from another app took, in whole minutes. */
export const outsideMinutes = (workout: ListedOutsideWorkout) =>
  Math.max(1, Math.round((workout.endedAt.getTime() - workout.startedAt.getTime()) / 60_000));

/** A workout's length, calories and source, as one line. */
export function useOutsideSummary() {
  const { t } = useTranslation();
  const duration = useDurationFormat();
  const { format } = useNumberFormat();
  return (workout: ListedOutsideWorkout, withSource = true) =>
    [
      duration(outsideMinutes(workout)),
      workout.activeKcal !== null
        ? t('history.kcalMeasured', { kcal: format(Math.round(workout.activeKcal)) })
        : null,
      withSource ? workout.source : null,
    ]
      .filter(Boolean)
      .join(' · ');
}

/**
 * A workout another app recorded, in a list of Benchbite's (#468, ADR 0106): its day, activity,
 * length, calories and source, in its own colour. Opens its details.
 */
export function OutsideWorkoutRow({
  workout,
  divider,
  onPress,
}: {
  workout: ListedOutsideWorkout;
  divider: boolean;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  const { colors, spacing } = useTheme();
  const summary = useOutsideSummary();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityHint={t('health.outside.open')}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        {
          gap: spacing.md,
          borderTopWidth: divider ? 1 : 0,
          borderTopColor: colors.border,
          opacity: pressed ? 0.6 : 1,
        },
      ]}
    >
      <DateTile date={workout.startedAt} outside />
      <View style={[styles.flex, { gap: 2 }]}>
        <View style={[styles.name, { gap: spacing.xs }]}>
          <Icon name={ACTIVITY_ICONS[workout.activity]} size={16} color="dinner" />
          <Text variant="label" numberOfLines={1} style={styles.shrink}>
            {t(`health.activities.${workout.activity}`)}
          </Text>
        </View>
        <Text variant="caption" color="textMuted" numberOfLines={1}>
          {summary(workout)}
        </Text>
      </View>
      <Icon name="forward" size={18} color="textMuted" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  name: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  shrink: {
    flexShrink: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
  },
  flex: {
    flex: 1,
  },
});
