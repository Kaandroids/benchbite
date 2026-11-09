import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { IconTile } from '@/components/ui/icon-tile';
import { Sheet } from '@/components/ui/sheet';
import { Text } from '@/components/ui/text';
import { useClockFormat, useDayFormat, useDurationFormat } from '@/i18n/dates';
import { useNumberFormat } from '@/i18n/units';
import { useTheme } from '@/theme';

import { ACTIVITY_ICONS } from './activities';
import { FigureRow, type Figure } from './figure-row';
import { outsideMinutes, useOutsideSource } from './outside-workout-row';
import type { ListedOutsideWorkout } from './outside-workouts';

/**
 * A workout another app recorded (#468, ADR 0106): what was done, when, and what was measured. It
 * is only shown: the app that recorded it changes or deletes it.
 */
export function OutsideWorkoutSheet({
  workout,
  onClose,
}: {
  workout: ListedOutsideWorkout;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { spacing } = useTheme();
  const day = useDayFormat();
  const clock = useClockFormat();
  const duration = useDurationFormat();
  const { format } = useNumberFormat();
  const figures: Figure[] = [
    { value: duration(outsideMinutes(workout)), label: t('health.outside.duration') },
    ...(workout.activeKcal !== null
      ? [{ value: format(Math.round(workout.activeKcal)), label: t('health.watch.kcal') }]
      : []),
    ...(workout.heartRateAvg !== null
      ? [{ value: String(Math.round(workout.heartRateAvg)), label: t('health.watch.averageBpm') }]
      : []),
  ];
  const source = useOutsideSource()(workout, 'through');
  return (
    <Sheet onClose={onClose}>
      <View style={[styles.row, { gap: spacing.md }]}>
        <IconTile
          name={ACTIVITY_ICONS[workout.activity]}
          size={48}
          color="dinner"
          background="dinnerBackground"
        />
        <View style={styles.flex}>
          <Text variant="headline" accessibilityRole="header">
            {t(`health.activities.${workout.activity}`)}
          </Text>
          <Text variant="caption" color="textMuted">
            {t('health.outside.time', {
              day: day(workout.startedAt),
              from: clock(workout.startedAt),
              to: clock(workout.endedAt),
            })}
          </Text>
        </View>
      </View>
      <Card>
        <FigureRow figures={figures} />
      </Card>
      <View style={{ gap: spacing.xs }}>
        {source ? <Text variant="label">{source}</Text> : null}
        <Text variant="caption" color="textMuted">
          {t('health.outside.note')}
        </Text>
      </View>
      <Button label={t('common.done')} variant="secondary" onPress={onClose} />
    </Sheet>
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
