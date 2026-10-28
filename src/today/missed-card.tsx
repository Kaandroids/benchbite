import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Card, type CardProps } from '@/components/ui/card';
import { IconTile } from '@/components/ui/icon-tile';
import { Text } from '@/components/ui/text';
import { useWeekdayFormat } from '@/i18n/dates';
import { useTheme } from '@/theme';
import { useWorkoutName } from '@/workouts/format';
import { useMoveWorkout } from '@/workouts/moves';
import { originOf, type PlannedWorkout, type ScheduleDay } from '@/workouts/week-schedule';

type MissedCardProps = {
  /** How the card comes in, from the screen that places it. */
  entering?: CardProps['entering'];
  workout: PlannedWorkout;
  /** The day it was missed on. */
  day: ScheduleDay;
  /** Whether a day is left this week to move it to. */
  canMove: boolean;
  onPickDay: () => void;
};

/** A workout missed this week, to skip or to move to a free day (ADR 0028). */
export function MissedCard({ workout, day, canMove, onPickDay, entering }: MissedCardProps) {
  const { t } = useTranslation();
  const { spacing } = useTheme();
  const weekdayName = useWeekdayFormat();
  const workoutName = useWorkoutName();
  const moveWorkout = useMoveWorkout();
  const { session } = workout;

  const skip = () =>
    moveWorkout.mutate({
      workoutId: session.workoutId,
      fromOn: originOf(workout, day),
      toOn: null,
    });

  return (
    <Card entering={entering}>
      <View style={[styles.row, { gap: spacing.md }]}>
        <IconTile name="missed" />
        <View style={styles.text}>
          <Text variant="caption" color="primaryText">
            {t('today.missed.missedOn', { day: weekdayName(day.weekday) })}
          </Text>
          <Text variant="headline">{workoutName(session)}</Text>
        </View>
      </View>
      <Text color="textMuted">
        {t('today.missed.hint', {
          session: t('workout.session', {
            count: session.exercises.length,
            minutes: session.estimatedMinutes,
          }),
        })}
      </Text>
      {moveWorkout.isError ? (
        <Text variant="caption" color="danger" accessibilityRole="alert">
          {t('today.missed.skipError')}
        </Text>
      ) : null}
      <View style={[styles.row, { gap: spacing.md }]}>
        <Button
          variant="secondary"
          label={t('today.missed.skip')}
          loading={moveWorkout.isPending}
          onPress={skip}
          style={styles.flex}
        />
        {canMove ? (
          <Button
            label={t('today.missed.pickDay')}
            disabled={moveWorkout.isPending}
            onPress={onPickDay}
            style={styles.flex}
          />
        ) : null}
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
  flex: {
    flex: 1,
  },
});
