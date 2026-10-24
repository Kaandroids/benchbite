import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import {
  fromIsoDate,
  toIsoDate,
  useShortDateFormat,
  useWeekdayFormat,
  weekdayOf,
} from '@/i18n/dates';
import { useTheme } from '@/theme';
import { useWorkoutName } from '@/workouts/format';
import { useMoveWorkout } from '@/workouts/moves';
import { moveTargets, type WeekSchedule } from '@/workouts/week-schedule';
import type { WeekSession } from '@/workouts/workouts';

/** The refusal of a move that no longer fits, for example because the day was taken elsewhere. */
const REFUSED = 'BB019';

type PickDayProps = {
  schedule: WeekSchedule;
  session: WeekSession;
  /** The day the workout is on in the plan. */
  fromOn: string;
  today: Date;
  onDone: () => void;
};

/** The days from today to Sunday a workout can move to, each with its workouts, to pick one. */
export function PickDay({ schedule, session, fromOn, today, onDone }: PickDayProps) {
  const { t } = useTranslation();
  const { colors, radii, spacing } = useTheme();
  const weekdayName = useWeekdayFormat('short');
  const longWeekday = useWeekdayFormat();
  const shortDate = useShortDateFormat(today);
  const workoutName = useWorkoutName();
  const moveWorkout = useMoveWorkout();
  const todayOn = toIsoDate(today);
  const targets = moveTargets(schedule, session.workoutId, fromOn, todayOn);
  const [selected, setSelected] = useState<string | undefined>(targets[0]?.date);
  // The days can change while the sheet is open, when the week is loaded again.
  const chosen = targets.find((day) => day.date === selected) ?? targets[0];

  const move = () => {
    if (!chosen) {
      return;
    }
    moveWorkout.mutate(
      { workoutId: session.workoutId, fromOn, toOn: chosen.date },
      { onSuccess: onDone },
    );
  };
  const refused = (moveWorkout.error as { code?: string } | null)?.code === REFUSED;

  return (
    <>
      <View style={styles.header}>
        <Text variant="headline" accessibilityRole="header">
          {t('today.pickDay.title', {
            day: longWeekday(weekdayOf(fromOn)),
            session: workoutName(session),
          })}
        </Text>
        <Text color="textMuted">{t('today.pickDay.subtitle')}</Text>
      </View>
      <View accessibilityRole="radiogroup" style={{ gap: spacing.sm }}>
        {targets.map((day) => {
          const checked = day.date === chosen?.date;
          const planned = day.workouts.filter((workout) => workout.status !== 'skipped');
          const isToday = day.date === todayOn;
          return (
            <Pressable
              key={day.date}
              accessibilityRole="radio"
              accessibilityState={{ checked }}
              onPress={() => setSelected(day.date)}
              style={[
                styles.row,
                {
                  gap: spacing.md,
                  padding: spacing.md,
                  borderRadius: radii.lg,
                  borderWidth: 2,
                  borderColor: checked ? colors.primary : colors.border,
                  backgroundColor: checked ? colors.selected : colors.surface,
                },
              ]}
            >
              <View style={styles.date}>
                <Text variant="bodyStrong">{weekdayName(day.weekday)}</Text>
                <Text variant="caption" color={isToday ? 'primaryText' : 'textMuted'}>
                  {isToday ? t('today.pickDay.today') : shortDate(fromIsoDate(day.date))}
                </Text>
              </View>
              <Text color="textMuted" style={styles.flex} numberOfLines={1}>
                {planned.length > 0
                  ? planned.map((workout) => workoutName(workout.session)).join(' · ')
                  : t('today.pickDay.rest')}
              </Text>
              <View
                style={[styles.radio, { borderColor: checked ? colors.primary : colors.border }]}
              >
                {checked ? (
                  <View style={[styles.dot, { backgroundColor: colors.primaryButton }]} />
                ) : null}
              </View>
            </Pressable>
          );
        })}
      </View>
      {moveWorkout.isError ? (
        <Text variant="caption" color="danger" accessibilityRole="alert">
          {refused ? t('today.pickDay.taken') : t('today.pickDay.error')}
        </Text>
      ) : null}
      <Button
        label={t('today.pickDay.move', { day: chosen ? longWeekday(chosen.weekday) : '' })}
        disabled={!chosen}
        loading={moveWorkout.isPending}
        onPress={move}
      />
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
  date: {
    width: 56,
  },
  flex: {
    flex: 1,
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
});
