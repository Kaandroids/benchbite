import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { Text } from '@/components/ui/text';
import { toIsoDate, useWeekdayFormat } from '@/i18n/dates';
import { isDbError } from '@/lib/errors';
import { useTheme } from '@/theme';
import { useWorkoutName } from '@/workouts/format';
import { useMoveWorkout } from '@/workouts/moves';
import {
  missedWorkouts,
  moveTargets,
  originOf,
  type PlannedWorkout,
  type ScheduleDay,
  type WeekSchedule,
} from '@/workouts/week-schedule';

type CatchUpProps = {
  schedule: WeekSchedule;
  today: Date;
  onDone: () => void;
};

/**
 * This week's missed workouts, each to move to a free day with one tap or to skip (ADR 0028). A
 * workout leaves the list once it is moved or skipped.
 */
export function CatchUp({ schedule, today, onDone }: CatchUpProps) {
  const { t } = useTranslation();
  const { colors, spacing } = useTheme();
  return (
    <>
      <View style={styles.header}>
        <Text variant="headline" accessibilityRole="header">
          {t('today.catchUp.title')}
        </Text>
        <Text color="textMuted">{t('today.catchUp.subtitle')}</Text>
      </View>
      {missedWorkouts(schedule).map(({ workout, day }) => (
        <View
          key={`${workout.session.workoutId}-${originOf(workout, day)}`}
          style={{ paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border }}
        >
          <MissedRow schedule={schedule} workout={workout} day={day} today={today} />
        </View>
      ))}
      <Button label={t('today.catchUp.done')} onPress={onDone} />
    </>
  );
}

type MissedRowProps = {
  schedule: WeekSchedule;
  workout: PlannedWorkout;
  /** The day it was missed on. */
  day: ScheduleDay;
  today: Date;
};

/** A missed workout with the days it can move to and a skip, each saved at once. */
function MissedRow({ schedule, workout, day, today }: MissedRowProps) {
  const { t } = useTranslation();
  const { spacing } = useTheme();
  const weekdayName = useWeekdayFormat();
  const shortWeekday = useWeekdayFormat('short');
  const workoutName = useWorkoutName();
  const moveWorkout = useMoveWorkout();
  const { session } = workout;
  const fromOn = originOf(workout, day);
  const todayOn = toIsoDate(today);
  const targets = moveTargets(schedule, session.workoutId, fromOn, todayOn);
  const name = workoutName(session);

  const move = (toOn: string | null) =>
    moveWorkout.mutate({ workoutId: session.workoutId, fromOn, toOn });
  // The day may have been taken elsewhere since the week loaded.
  const refused = isDbError(moveWorkout.error, 'moveDoesNotFit');
  const dayLabel = (target: ScheduleDay) =>
    target.date === todayOn ? t('today.catchUp.today') : shortWeekday(target.weekday);

  return (
    <View style={{ gap: spacing.sm }}>
      <View style={[styles.row, { gap: spacing.md }]}>
        <View style={styles.text}>
          <Text variant="bodyStrong">{name}</Text>
          <Text variant="caption" color="textMuted">
            {t('today.catchUp.missedOn', {
              day: weekdayName(day.weekday),
              session: t('workout.session', {
                count: session.exercises.length,
                minutes: session.estimatedMinutes,
              }),
            })}
          </Text>
        </View>
        <Button
          variant="ghost"
          size="small"
          label={t('today.catchUp.skip')}
          accessibilityHint={t('today.catchUp.skipHint', { session: name })}
          disabled={moveWorkout.isPending}
          onPress={() => move(null)}
        />
      </View>
      {targets.length > 0 ? (
        <View style={[styles.days, { gap: spacing.sm }]}>
          {targets.map((target) => (
            <Chip
              key={target.date}
              label={dayLabel(target)}
              accessibilityLabel={t('today.catchUp.moveLabel', {
                session: name,
                day: target.date === todayOn ? dayLabel(target) : weekdayName(target.weekday),
              })}
              selected={moveWorkout.isPending && moveWorkout.variables?.toOn === target.date}
              disabled={moveWorkout.isPending}
              onPress={() => move(target.date)}
            />
          ))}
        </View>
      ) : (
        <Text variant="caption" color="textMuted">
          {t('today.catchUp.noDays')}
        </Text>
      )}
      {moveWorkout.isError ? (
        <Text variant="caption" color="danger" accessibilityRole="alert">
          {refused ? t('today.pickDay.taken') : t('today.pickDay.error')}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    gap: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  text: {
    flex: 1,
    gap: 2,
  },
  days: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
});
