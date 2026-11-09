import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { Card, listDivider, type CardProps } from '@/components/ui/card';
import { Caption } from '@/components/ui/caption';
import { Icon } from '@/components/ui/icon';
import { IconTile } from '@/components/ui/icon-tile';
import { Text } from '@/components/ui/text';
import { useClockFormat } from '@/i18n/dates';
import { useTheme } from '@/theme';

import { ACTIVITY_ICONS } from './activities';
import { useOutsideSummary } from './outside-workout-row';
import { OutsideWorkoutSheet } from './outside-workout-sheet';
import type { ListedOutsideWorkout } from './outside-workouts';
import { useStoreName } from './use-store-name';

/**
 * Today's workouts from other apps, under Today's own (#468, ADR 0106): each with its time, length,
 * calories and source, opening its details. Nothing without any.
 */
export function AlsoTodayCard({
  workouts,
  entering,
}: {
  workouts: ListedOutsideWorkout[];
  entering?: CardProps['entering'];
}) {
  const { t } = useTranslation();
  const { colors, spacing } = useTheme();
  const clock = useClockFormat();
  const summary = useOutsideSummary();
  const store = useStoreName();
  const [open, setOpen] = useState<ListedOutsideWorkout | null>(null);
  if (workouts.length === 0) return null;

  return (
    <View style={{ gap: spacing.sm }}>
      <Caption accessibilityRole="header">{t('health.outside.alsoToday')}</Caption>
      <Card list entering={entering}>
        {workouts.map((workout, index) => (
          <Pressable
            key={workout.key}
            accessibilityRole="button"
            accessibilityHint={t('health.outside.open')}
            onPress={() => setOpen(workout)}
            style={({ pressed }) => [
              styles.row,
              { gap: spacing.md, paddingVertical: spacing.md, opacity: pressed ? 0.6 : 1 },
              listDivider(index === 0, colors.border),
            ]}
          >
            <IconTile
              name={ACTIVITY_ICONS[workout.activity]}
              size={44}
              color="dinner"
              background="dinnerBackground"
            />
            <View style={[styles.flex, { gap: 2 }]}>
              <Text variant="label">{t(`health.activities.${workout.activity}`)}</Text>
              <Text variant="caption" color="textMuted" numberOfLines={1}>
                {[clock(workout.startedAt), summary(workout, false)].join(' · ')}
              </Text>
              {workout.source || store ? (
                <Text variant="captionStrong" color="dinner" numberOfLines={1}>
                  {workout.source
                    ? t('health.outside.from', { source: workout.source })
                    : t('health.outside.fromStore', { store })}
                </Text>
              ) : null}
            </View>
            <Icon name="forward" size={18} color="textMuted" />
          </Pressable>
        ))}
      </Card>
      {open ? <OutsideWorkoutSheet workout={open} onClose={() => setOpen(null)} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  flex: {
    flex: 1,
  },
});
