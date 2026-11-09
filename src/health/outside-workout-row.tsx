import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { DateTile } from '@/components/ui/date-tile';
import { Icon } from '@/components/ui/icon';
import { IconTile } from '@/components/ui/icon-tile';
import { Text } from '@/components/ui/text';
import { useClockFormat } from '@/i18n/dates';
import { useTheme } from '@/theme';

import { ACTIVITY_ICONS } from './activities';
import { useOutsideSource, useOutsideSummary } from './outside-format';
import type { ListedOutsideWorkout } from './outside-workouts';
import { READ_LOOKS } from './reads';

/** The colours of workouts from other apps, set apart from Benchbite's orange. */
const { color, background } = READ_LOOKS.workouts;

type RowProps = { workout: ListedOutsideWorkout; divider: boolean; onPress: () => void };

/** What every row of a workout from another app shares: it opens its details, with a chevron. */
function RowShell({
  divider,
  onPress,
  leading,
  children,
}: Omit<RowProps, 'workout'> & { leading: ReactNode; children: ReactNode }) {
  const { t } = useTranslation();
  const { colors, spacing } = useTheme();
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
      {leading}
      <View style={[styles.flex, { gap: 2 }]}>{children}</View>
      <Icon name="forward" size={18} color="textMuted" />
    </Pressable>
  );
}

/**
 * A workout another app recorded, among the history's logs (#468, ADR 0106), in its own colour: its
 * day, its activity with its icon, and its length, calories and source.
 */
export function OutsideHistoryRow({ workout, ...row }: RowProps) {
  const { t } = useTranslation();
  const { spacing } = useTheme();
  const summary = useOutsideSummary();
  return (
    <RowShell
      {...row}
      leading={<DateTile date={workout.startedAt} color={color} background={background} />}
    >
      <View style={[styles.name, { gap: spacing.xs }]}>
        <Icon name={ACTIVITY_ICONS[workout.activity]} size={16} color={color} />
        <Text variant="label" numberOfLines={1} style={styles.shrink}>
          {t(`health.activities.${workout.activity}`)}
        </Text>
      </View>
      <Text variant="caption" color="textMuted" numberOfLines={1}>
        {summary(workout)}
      </Text>
    </RowShell>
  );
}

/**
 * A workout another app recorded today, under Today's own (#468, ADR 0106): its activity's icon, its
 * time, length and calories, and where it came from.
 */
export function OutsideTodayRow({ workout, ...row }: RowProps) {
  const { t } = useTranslation();
  const summary = useOutsideSummary();
  const clock = useClockFormat();
  const source = useOutsideSource()(workout, 'from');
  return (
    <RowShell
      {...row}
      leading={
        <IconTile
          name={ACTIVITY_ICONS[workout.activity]}
          size={44}
          color={color}
          background={background}
        />
      }
    >
      <Text variant="label" numberOfLines={1}>
        {t(`health.activities.${workout.activity}`)}
      </Text>
      <Text variant="caption" color="textMuted" numberOfLines={1}>
        {[clock(workout.startedAt), summary(workout, false)].join(' · ')}
      </Text>
      {source ? (
        <Text variant="captionStrong" color={color} numberOfLines={1}>
          {source}
        </Text>
      ) : null}
    </RowShell>
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
