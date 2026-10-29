import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Chip } from '@/components/ui/chip';
import { PillButton } from '@/components/ui/pill-button';
import { Text } from '@/components/ui/text';
import { fromIsoDate, toIsoDate, useWeekdayDateFormat, useWeekdayFormat } from '@/i18n/dates';
import { useNumberFormat } from '@/i18n/units';
import { canLog } from '@/nutrition/meals';
import { useTheme } from '@/theme';
import { useWorkoutName } from '@/workouts/format';
import { useMoveWorkout } from '@/workouts/moves';
import { moveTargets, originOf, type WeekSchedule } from '@/workouts/week-schedule';

import type { MissedDay } from './streak';

type MissedDayRowsProps = {
  missedDay: MissedDay;
  /** This week, for postponing a workout of it (ADR 0028). */
  schedule: WeekSchedule;
  today: Date;
  /** Opens the day to log it. */
  onLog: (day: string) => void;
  /** Called once a workout is postponed, with a message saying where to. */
  onMoved: (message: string) => void;
};

/**
 * A missed day of a break, with what kept it from counting under it: each workout not done, to
 * postpone while the week still has a free day for it, and the calories, to log while the day can
 * still be logged. Calories over the target can only be frozen.
 */
export function MissedDayRows({ missedDay, schedule, today, onLog, onMoved }: MissedDayRowsProps) {
  const { t } = useTranslation();
  const { colors, spacing } = useTheme();
  const { format } = useNumberFormat();
  const shortDay = useWeekdayDateFormat();
  const { day, workouts, eaten, target, caloriesCount } = missedDay;
  const label = shortDay(fromIsoDate(day));

  return (
    <View style={{ gap: spacing.xs }}>
      <Text variant="label">{label}</Text>
      <View style={[styles.reasons, { borderLeftColor: colors.border, paddingLeft: spacing.md }]}>
        {workouts.map((workout) => (
          <WorkoutReason
            key={workout.id}
            workout={workout}
            day={day}
            schedule={schedule}
            today={today}
            onMoved={onMoved}
          />
        ))}
        {caloriesCount ? null : eaten === 0 ? (
          <Reason text={t('streak.break.noMeals')}>
            {canLog(day, today) ? (
              <PillButton
                label={t('streak.break.log')}
                accessibilityLabel={t('streak.break.logDay', { day: label })}
                onPress={() => onLog(day)}
              />
            ) : (
              <Muted>{t('streak.break.tooLate')}</Muted>
            )}
          </Reason>
        ) : (
          <Reason text={t('streak.break.over', { kcal: format(Math.round(eaten - target)) })}>
            <Muted>{t('streak.break.onlyFreeze')}</Muted>
          </Reason>
        )}
      </View>
    </View>
  );
}

type WorkoutReasonProps = {
  workout: MissedDay['workouts'][number];
  day: string;
  schedule: WeekSchedule;
  today: Date;
  onMoved: (message: string) => void;
};

/** A workout that kept its day from counting, with the free days of this week to postpone it to. */
function WorkoutReason({ workout, day, schedule, today, onMoved }: WorkoutReasonProps) {
  const { t } = useTranslation();
  const { spacing } = useTheme();
  const workoutName = useWorkoutName();
  const weekday = useWeekdayFormat();
  const shortWeekday = useWeekdayFormat('short');
  const moveWorkout = useMoveWorkout();
  const [open, setOpen] = useState(false);
  const name = workoutName(workout);
  const todayOn = toIsoDate(today);

  // Only a workout of this week moves, from the day it is planned on.
  const scheduleDay = schedule.days.find((other) => other.date === day);
  const planned = scheduleDay?.workouts.find((item) => item.session.workoutId === workout.id);
  const fromOn = planned && scheduleDay ? originOf(planned, scheduleDay) : null;
  const targets = fromOn ? moveTargets(schedule, workout.id, fromOn, todayOn) : [];
  const dayName = (date: string, weekdayOf: number) =>
    date === todayOn ? t('today.move.today') : weekday(weekdayOf);

  return (
    <View style={{ gap: spacing.sm }}>
      <Reason text={t(workout.skipped ? 'streak.break.skipped' : 'streak.break.notDone', { name })}>
        {targets.length > 0 ? (
          <PillButton
            label={t('streak.break.postpone')}
            accessibilityLabel={t('streak.break.postponeLabel', { name })}
            onPress={() => setOpen(!open)}
          />
        ) : (
          <Muted>{t('streak.break.cannotMove')}</Muted>
        )}
      </Reason>
      {open && fromOn ? (
        <View style={[styles.days, { gap: spacing.sm }]}>
          {targets.map((target) => (
            <Chip
              key={target.date}
              label={target.date === todayOn ? t('today.move.today') : shortWeekday(target.weekday)}
              accessibilityLabel={t('today.catchUp.moveLabel', {
                session: name,
                day: dayName(target.date, target.weekday),
              })}
              selected={moveWorkout.isPending && moveWorkout.variables?.toOn === target.date}
              disabled={moveWorkout.isPending}
              onPress={() =>
                moveWorkout.mutate(
                  { workoutId: workout.id, fromOn, toOn: target.date },
                  {
                    onSuccess: () =>
                      onMoved(
                        target.date === todayOn
                          ? t('streak.break.movedToday', { name })
                          : t('streak.break.moved', { name, day: weekday(target.weekday) }),
                      ),
                  },
                )
              }
            />
          ))}
        </View>
      ) : null}
      {moveWorkout.isError ? (
        <Text variant="caption" color="danger">
          {t('streak.break.moveError')}
        </Text>
      ) : null}
    </View>
  );
}

/** One thing that kept a day from counting, with what can be done about it. */
function Reason({ text, children }: { text: string; children: ReactNode }) {
  const { spacing } = useTheme();
  return (
    <View style={[styles.row, { gap: spacing.md, paddingVertical: spacing.xs }]}>
      <Text style={styles.flex}>{text}</Text>
      {children}
    </View>
  );
}

function Muted({ children }: { children: string }) {
  return (
    <Text variant="caption" color="textMuted" align="right" style={styles.muted}>
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  reasons: {
    borderLeftWidth: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  flex: {
    flex: 1,
  },
  muted: {
    maxWidth: 140,
  },
  days: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
});
