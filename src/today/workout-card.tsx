import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import { FadeInDown } from 'react-native-reanimated';

import { Card } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { IconTile } from '@/components/ui/icon-tile';
import { Text } from '@/components/ui/text';
import { toIsoDate, useWeekdayFormat } from '@/i18n/dates';
import { useTheme } from '@/theme';
import { useWorkoutName } from '@/workouts/format';
import { nextSession } from '@/workouts/next-session';
import type { WeekSession } from '@/workouts/workouts';

type WorkoutCardProps = {
  plan: { sessions: WeekSession[] };
  today: Date;
  /** The days of the workouts finished this week, as ISO dates. */
  finished: string[];
};

/** The session after today, for a day whose workout is done. */
function sessionAfter<S extends { weekday: number }>(plan: { sessions: S[] }, today: Date) {
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const next = nextSession(plan, tomorrow);
  return next && { session: next.session, inDays: next.inDays + 1 };
}

/**
 * Today's workout with its size, which opens the workout. On a rest day, or once a workout is
 * done today, it says when the next one is.
 */
export function WorkoutCard({ plan, today, finished }: WorkoutCardProps) {
  const { t } = useTranslation();
  const { spacing } = useTheme();
  const weekdayName = useWeekdayFormat();
  const workoutName = useWorkoutName();
  const done = finished.includes(toIsoDate(today));
  const upcoming = done ? sessionAfter(plan, today) : nextSession(plan, today);
  const session = upcoming?.inDays === 0 ? upcoming.session : null;

  if (!upcoming) {
    return null;
  }

  if (!session) {
    const { inDays, session: next } = upcoming;
    return (
      <Card entering={FadeInDown.delay(100).duration(400)}>
        <View style={[styles.row, { gap: spacing.md }]}>
          <IconTile name={done ? 'check' : 'moon'} />
          <View style={styles.text}>
            <Text variant="headline">
              {done ? t('today.workout.done') : t('today.workout.restDay')}
            </Text>
            <Text color="textMuted">
              {t('today.workout.next', {
                day: inDays === 1 ? t('today.workout.tomorrow') : weekdayName(next.weekday),
                session: workoutName(next),
              })}
            </Text>
          </View>
        </View>
      </Card>
    );
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityHint={t('today.workout.open')}
      onPress={() =>
        router.push({ pathname: '/workout/[id]', params: { id: String(session.workoutId) } })
      }
      style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
    >
      <Card entering={FadeInDown.delay(100).duration(400)}>
        <View style={[styles.row, { gap: spacing.md }]}>
          <IconTile name="dumbbell" />
          <View style={styles.text}>
            <Text variant="caption" color="primaryText">
              {t('today.workout.title')}
            </Text>
            <Text variant="headline">{workoutName(session)}</Text>
          </View>
          <Icon name="forward" color="textMuted" />
        </View>
        <Text color="textMuted">
          {t('workout.session', {
            count: session.exercises.length,
            minutes: session.estimatedMinutes,
          })}
        </Text>
      </Card>
    </Pressable>
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
