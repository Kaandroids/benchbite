import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { fromIsoDate, isoWeekday, toIsoDate, useDayFormat, useWeekdayFormat } from '@/i18n/dates';
import { useTheme } from '@/theme';
import { useWorkoutName } from '@/workouts/format';
import { useUndoMove } from '@/workouts/moves';
import {
  moveTargets,
  originOf,
  type ScheduleDay,
  type WeekSchedule,
} from '@/workouts/week-schedule';
import type { WeekSession } from '@/workouts/workouts';

import { MovedFrom } from './moved-from';

type DayMenuProps = {
  schedule: WeekSchedule;
  day: ScheduleDay;
  today: Date;
  /** Opens the days the workout can move to. */
  onMove: (session: WeekSession, fromOn: string) => void;
};

/**
 * A day's workouts from the week card: each can move to another day, and a move or skip that is
 * not done yet can be undone (ADR 0028).
 */
export function DayMenu({ schedule, day, today, onMove }: DayMenuProps) {
  const { t } = useTranslation();
  const { colors, radii, spacing } = useTheme();
  const formatDay = useDayFormat();
  const weekdayName = useWeekdayFormat();
  const workoutName = useWorkoutName();
  const undoMove = useUndoMove();
  const todayOn = toIsoDate(today);

  const caption = (text: string) => (
    <Text variant="caption" color="textMuted">
      {text}
    </Text>
  );
  const undo = (session: WeekSession, fromOn: string, label: string) => (
    <Button
      variant="secondary"
      size="small"
      label={label}
      disabled={undoMove.isPending}
      onPress={() => undoMove.mutate({ workoutId: session.workoutId, fromOn })}
    />
  );

  const rows: { key: string; session: WeekSession; detail: ReactNode; action: ReactNode }[] = [
    ...day.workouts.map((workout, index) => {
      const { session, status, movedFrom } = workout;
      const fromOn = originOf(workout, day);
      let detail = caption(
        t('workout.session', {
          count: session.exercises.length,
          minutes: session.estimatedMinutes,
        }),
      );
      let action: ReactNode = null;
      if (status === 'done') {
        detail = caption(t('today.dayMenu.done'));
      } else if (status === 'skipped') {
        detail = caption(t('today.dayMenu.skipped'));
        action = undo(session, fromOn, t('today.dayMenu.undoSkip'));
      } else if (movedFrom) {
        detail = <MovedFrom date={movedFrom} />;
        action = undo(session, fromOn, t('today.dayMenu.undo'));
      } else if (moveTargets(schedule, session.workoutId, fromOn, todayOn).length > 0) {
        action = (
          <Button
            variant="secondary"
            size="small"
            label={t('today.dayMenu.move')}
            onPress={() => onMove(session, fromOn)}
          />
        );
      }
      return { key: `planned-${index}`, session, detail, action };
    }),
    ...day.movedAway.map((away, index) => {
      // The move can be undone until the workout is done on the day it moved to.
      const done = schedule.days
        .find((other) => other.date === away.toOn)
        ?.workouts.some(
          (workout) =>
            workout.session.workoutId === away.session.workoutId &&
            workout.movedFrom === day.date &&
            workout.status === 'done',
        );
      return {
        key: `away-${index}`,
        session: away.session,
        detail: caption(
          t('today.dayMenu.movedTo', { day: weekdayName(isoWeekday(fromIsoDate(away.toOn))) }),
        ),
        action: done ? null : undo(away.session, day.date, t('today.dayMenu.undo')),
      };
    }),
  ];

  return (
    <>
      <View style={styles.header}>
        <Text variant="headline" accessibilityRole="header">
          {formatDay(fromIsoDate(day.date))}
        </Text>
        <Text color="textMuted">{t('today.dayMenu.planned', { count: day.total })}</Text>
      </View>
      <View style={{ gap: spacing.sm }}>
        {rows.map(({ key, session, detail, action }) => (
          <View
            key={key}
            style={[
              styles.row,
              {
                gap: spacing.md,
                padding: spacing.md,
                borderRadius: radii.lg,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.surface,
              },
            ]}
          >
            <View style={styles.text}>
              <Text variant="bodyStrong">{workoutName(session)}</Text>
              {detail}
            </View>
            {action}
          </View>
        ))}
      </View>
      {undoMove.isError ? (
        <Text variant="caption" color="danger" accessibilityRole="alert">
          {t('today.dayMenu.error')}
        </Text>
      ) : null}
      <Text variant="caption" color="textMuted">
        {t('today.dayMenu.note')}
      </Text>
    </>
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
});
