import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { DateTile } from '@/components/ui/date-tile';
import { Icon } from '@/components/ui/icon';
import { IconTile } from '@/components/ui/icon-tile';
import { Text } from '@/components/ui/text';
import { useClockFormat, useDurationFormat } from '@/i18n/dates';
import { useNumberFormat } from '@/i18n/units';
import { useTheme } from '@/theme';

import { ACTIVITY_ICONS } from './activities';
import type { ListedOutsideWorkout } from './outside-workouts';
import { useStoreName } from './use-store-name';

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
 * Where a workout came from, in words: "From Apple Watch" under it, or "Apple Watch, through Apple
 * Health" in its details; the store alone when no app is named. Null without either.
 */
export function useOutsideSource() {
  const { t } = useTranslation();
  const store = useStoreName();
  return (workout: ListedOutsideWorkout, form: 'from' | 'through'): string | null => {
    if (workout.source) {
      if (form === 'from') return t('health.outside.from', { source: workout.source });
      return store ? t('health.watch.through', { source: workout.source, store }) : workout.source;
    }
    if (!store) return null;
    return form === 'from'
      ? t('health.outside.fromStore', { store })
      : t('health.watch.throughStore', { store });
  };
}

/**
 * A workout another app recorded, in a list of Benchbite's (#468, ADR 0106), in its own colour.
 * Opens its details. In the history it leads with its day, and its line ends with its source; on
 * Today it leads with its activity's icon, its line starts with its time, and its source follows.
 */
export function OutsideWorkoutRow({
  workout,
  divider,
  onPress,
  leading = 'day',
}: {
  workout: ListedOutsideWorkout;
  divider: boolean;
  onPress: () => void;
  leading?: 'day' | 'icon';
}) {
  const { t } = useTranslation();
  const { colors, spacing } = useTheme();
  const summary = useOutsideSummary();
  const clock = useClockFormat();
  const sourceText = useOutsideSource();
  const source = leading === 'icon' ? sourceText(workout, 'from') : null;
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
      {leading === 'day' ? (
        <DateTile date={workout.startedAt} outside />
      ) : (
        <IconTile
          name={ACTIVITY_ICONS[workout.activity]}
          size={44}
          color="dinner"
          background="dinnerBackground"
        />
      )}
      <View style={[styles.flex, { gap: 2 }]}>
        <View style={[styles.name, { gap: spacing.xs }]}>
          {leading === 'day' ? (
            <Icon name={ACTIVITY_ICONS[workout.activity]} size={16} color="dinner" />
          ) : null}
          <Text variant="label" numberOfLines={1} style={styles.shrink}>
            {t(`health.activities.${workout.activity}`)}
          </Text>
        </View>
        <Text variant="caption" color="textMuted" numberOfLines={1}>
          {leading === 'day'
            ? summary(workout)
            : [clock(workout.startedAt), summary(workout, false)].join(' · ')}
        </Text>
        {source ? (
          <Text variant="captionStrong" color="dinner" numberOfLines={1}>
            {source}
          </Text>
        ) : null}
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
