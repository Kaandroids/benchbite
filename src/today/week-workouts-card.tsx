import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { Card, type CardProps } from '@/components/ui/card';
import { IconTile } from '@/components/ui/icon-tile';
import { Text } from '@/components/ui/text';
import { useDurationFormat } from '@/history/format';
import { durationMinutes, type LogSummary } from '@/history/history';
import { isoWeekday, useWeekdayFormat } from '@/i18n/dates';
import { useNumberFormat } from '@/i18n/units';
import { useTheme } from '@/theme';
import { useWorkoutName } from '@/workouts/format';
import type { WeekSchedule } from '@/workouts/week-schedule';

type WeekWorkoutsCardProps = {
  entering?: CardProps['entering'];
  /** The workouts finished in the week, in the order they started. */
  logs: LogSummary[];
  schedule: WeekSchedule;
};

/**
 * A past week's workouts (ADR 0046): each one finished, with its length, the weight lifted and its
 * day, which opens it, and under them the ones missed.
 */
export function WeekWorkoutsCard({ entering, logs, schedule }: WeekWorkoutsCardProps) {
  const { t } = useTranslation();
  const { colors, spacing } = useTheme();
  const { format } = useNumberFormat();
  const workoutName = useWorkoutName();
  const duration = useDurationFormat();
  const weekdayName = useWeekdayFormat('short');
  const longWeekday = useWeekdayFormat();
  const missed = schedule.days.flatMap((day) =>
    day.workouts
      .filter((workout) => workout.status === 'missed')
      .map((workout) => ({ weekday: day.weekday, session: workout.session })),
  );

  return (
    <Card entering={entering} style={{ gap: spacing.sm }}>
      <View style={styles.header}>
        <Text variant="headline" accessibilityRole="header" style={styles.flex}>
          {t('today.pastWeek.workouts.title')}
        </Text>
        {schedule.planned > 0 ? (
          <Text variant="captionStrong" color="textMuted">
            {t('today.pastWeek.workouts.count', { done: schedule.done, count: schedule.planned })}
          </Text>
        ) : null}
      </View>
      {logs.length === 0 && missed.length === 0 ? (
        <Text variant="caption" color="textMuted">
          {t('today.pastWeek.workouts.none')}
        </Text>
      ) : null}
      <View>
        {logs.map((log, index) => (
          <Pressable
            key={log.id}
            accessibilityRole="button"
            accessibilityHint={t('today.pastWeek.workouts.open')}
            onPress={() =>
              router.push({ pathname: '/workout/log/[id]', params: { id: String(log.id) } })
            }
            style={({ pressed }) => [
              styles.row,
              {
                gap: spacing.md,
                borderTopWidth: index > 0 ? StyleSheet.hairlineWidth : 0,
                borderTopColor: colors.border,
                opacity: pressed ? 0.6 : 1,
              },
            ]}
          >
            <IconTile name="dumbbell" size={34} />
            <View style={styles.flex}>
              <Text variant="label" numberOfLines={1}>
                {workoutName(log)}
              </Text>
              <Text variant="caption" color="textMuted" numberOfLines={1}>
                {[
                  duration(durationMinutes(log)),
                  ...(log.kilograms > 0 ? [`${format(Math.round(log.kilograms))} kg`] : []),
                ].join(' · ')}
              </Text>
            </View>
            <Text variant="captionStrong" color="textMuted">
              {weekdayName(isoWeekday(log.startedAt))}
            </Text>
          </Pressable>
        ))}
      </View>
      {missed.map(({ weekday, session }) => (
        <Text key={`${weekday}-${session.workoutId}`} variant="caption" color="textMuted">
          {t('today.pastWeek.workouts.missed', {
            day: longWeekday(weekday),
            workout: workoutName(session),
          })}
        </Text>
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  flex: {
    flex: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
  },
});
