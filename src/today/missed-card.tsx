import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Card, type CardProps } from '@/components/ui/card';
import { IconTile } from '@/components/ui/icon-tile';
import { PillButton } from '@/components/ui/pill-button';
import { Text } from '@/components/ui/text';
import { useWeekdayFormat } from '@/i18n/dates';
import { useTheme } from '@/theme';
import { useWorkoutName } from '@/workouts/format';
import type { PlannedWorkout, ScheduleDay } from '@/workouts/week-schedule';

type MissedCardProps = {
  /** This week's missed workouts with the day each was missed on, earliest first. */
  missed: { workout: PlannedWorkout; day: ScheduleDay }[];
  onCatchUp: () => void;
  /** How the card comes in, from the screen that places it. */
  entering?: CardProps['entering'];
};

/**
 * The workouts missed this week in one compact card, however many there are, with one button that
 * opens them to move to a free day or to skip (ADR 0028).
 */
export function MissedCard({ missed, onCatchUp, entering }: MissedCardProps) {
  const { t } = useTranslation();
  const { spacing } = useTheme();
  const weekdayName = useWeekdayFormat();
  const workoutName = useWorkoutName();
  const [first] = missed;
  if (!first) {
    return null;
  }

  let caption, title, detail;
  if (missed.length === 1) {
    const { session } = first.workout;
    caption = t('today.missed.missedOn', { day: weekdayName(first.day.weekday) });
    title = workoutName(session);
    detail = t('workout.session', {
      count: session.exercises.length,
      minutes: session.estimatedMinutes,
    });
  } else {
    caption = t('today.missed.count', { count: missed.length });
    // A workout missed on several days, or a day with several missed, is named once.
    const once = (names: string[]) => [...new Set(names)].join(', ');
    title = once(missed.map(({ workout }) => workoutName(workout.session)));
    detail = once(missed.map(({ day }) => weekdayName(day.weekday)));
  }

  return (
    <Card entering={entering}>
      <View style={[styles.row, { gap: spacing.md }]}>
        <IconTile name="missed" />
        <View style={styles.text}>
          <Text variant="caption" color="primaryText">
            {caption}
          </Text>
          <Text variant="headline" numberOfLines={1}>
            {title}
          </Text>
          <Text variant="caption" color="textMuted">
            {detail}
          </Text>
        </View>
        <PillButton variant="primary" label={t('today.missed.catchUp')} onPress={onCatchUp} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  text: {
    flex: 1,
    gap: 2,
  },
});
