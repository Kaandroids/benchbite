import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { Text } from '@/components/ui/text';
import { toIsoDate, useWeekdayFormat } from '@/i18n/dates';
import { useTheme } from '@/theme';
import { useSessionSize, useWorkoutName } from '@/workouts/format';
import { useMoveWorkout } from '@/workouts/moves';
import {
  type MissedWorkout,
  moveTargets,
  originOf,
  type PlannedWorkout,
  type ScheduleDay,
  type WeekSchedule,
} from '@/workouts/week-schedule';

import { MoveError } from './move-error';

type CatchUpProps = {
  /** This week's missed workouts with the day each was missed on, earliest first. */
  missed: MissedWorkout[];
  schedule: WeekSchedule;
  today: Date;
  onDone: () => void;
};

/**
 * This week's missed workouts, each to move to a free day with one tap or to skip (ADR 0028). A
 * workout leaves the list once it is moved or skipped.
 */
export function CatchUp({ missed, schedule, today, onDone }: CatchUpProps) {
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
      {missed.map(({ workout, day }) => (
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
  const sessionSize = useSessionSize();
  const moveWorkout = useMoveWorkout();
  const { session } = workout;
  const fromOn = originOf(workout, day);
  const todayOn = toIsoDate(today);
  const targets = moveTargets(schedule, session.workoutId, fromOn, todayOn);
  const name = workoutName(session);

  const move = (toOn: string | null) =>
    moveWorkout.mutate({ workoutId: session.workoutId, fromOn, toOn });

  return (
    <View style={{ gap: spacing.sm }}>
      <View style={[styles.row, { gap: spacing.md }]}>
        <View style={styles.text}>
          <Text variant="bodyStrong">{name}</Text>
          <Text variant="caption" color="textMuted">
            {t('today.catchUp.missedOn', {
              day: weekdayName(day.weekday),
              session: sessionSize(session),
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
          {targets.map((target) => {
            const isToday = target.date === todayOn;
            return (
              <Chip
                key={target.date}
                label={isToday ? t('today.move.today') : shortWeekday(target.weekday)}
                accessibilityLabel={t('today.catchUp.moveLabel', {
                  session: name,
                  day: isToday ? t('today.move.today') : weekdayName(target.weekday),
                })}
                selected={moveWorkout.isPending && moveWorkout.variables?.toOn === target.date}
                disabled={moveWorkout.isPending}
                onPress={() => move(target.date)}
              />
            );
          })}
        </View>
      ) : (
        <Text variant="caption" color="textMuted">
          {t('today.catchUp.noDays')}
        </Text>
      )}
      <MoveError move={moveWorkout} />
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
