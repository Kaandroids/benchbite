import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Chip } from '@/components/ui/chip';
import { toIsoDate, useWeekdayFormat } from '@/i18n/dates';
import { useTheme } from '@/theme';

import type { ScheduleDay, WorkoutMove } from './week-schedule';

type MoveDayChipsProps = {
  /** The free days to move to, from `moveTargets()`. */
  targets: ScheduleDay[];
  today: Date;
  /** The workout's name, for screen readers. */
  name: string;
  /** The move under way, from `useMoveWorkout`: its day shows as chosen while it lasts. */
  move: { isPending: boolean; variables?: WorkoutMove };
  onMove: (toOn: string) => void;
};

/** The free days of the week a workout can move to, today first named as today (ADR 0028). */
export function MoveDayChips({ targets, today, name, move, onMove }: MoveDayChipsProps) {
  const { t } = useTranslation();
  const { spacing } = useTheme();
  const weekday = useWeekdayFormat();
  const shortWeekday = useWeekdayFormat('short');
  const todayOn = toIsoDate(today);
  return (
    <View style={[styles.days, { gap: spacing.sm }]}>
      {targets.map((target) => {
        const isToday = target.date === todayOn;
        return (
          <Chip
            key={target.date}
            label={isToday ? t('today.move.today') : shortWeekday(target.weekday)}
            accessibilityLabel={t('today.catchUp.moveLabel', {
              session: name,
              day: isToday ? t('today.move.today') : weekday(target.weekday),
            })}
            selected={move.isPending && move.variables?.toOn === target.date}
            disabled={move.isPending}
            onPress={() => onMove(target.date)}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  days: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
});
