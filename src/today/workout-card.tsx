import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { Card, type CardProps } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { IconTile } from '@/components/ui/icon-tile';
import { Text } from '@/components/ui/text';
import { isoWeekday, useWeekdayFormat } from '@/i18n/dates';
import { useTheme } from '@/theme';
import { useSessionSize, useSessionsSize, useWorkoutName } from '@/workouts/format';
import { nextWorkouts, type PlannedWorkout, type WeekSchedule } from '@/workouts/week-schedule';
import type { WeekSession } from '@/workouts/workouts';

import { MovedFrom } from './moved-from';
import { PlanRow } from './plan-row';

type WorkoutCardProps = {
  /** How the card comes in, from the screen that places it. */
  entering?: CardProps['entering'];
  /** The week after its moves, with the workouts finished in it (ADR 0028). */
  schedule: WeekSchedule;
  /** The plan's sessions, for the next workout after this week. */
  sessions: WeekSession[];
  today: Date;
};

function openWorkout(session: WeekSession) {
  router.push({ pathname: '/workout/[id]', params: { id: String(session.workoutId) } });
}

/**
 * Today's workouts. One still to do shows with its size and opens the workout; several show as a
 * list, each done or to open. On a rest day, or once today's are done, it shows the next ones and
 * opens the first.
 */
export function WorkoutCard({ schedule, sessions, today, entering }: WorkoutCardProps) {
  const { t } = useTranslation();
  const { colors, spacing } = useTheme();
  const weekdayName = useWeekdayFormat();
  const workoutName = useWorkoutName();
  const sessionSize = useSessionSize();
  const sessionsSize = useSessionsSize();
  const day = schedule.days[isoWeekday(today) - 1];
  const todays = day?.workouts.filter((workout) => workout.status !== 'skipped') ?? [];
  const ahead = todays.filter((workout) => workout.status === 'planned');

  if (ahead.length === 0) {
    const next = nextWorkouts(schedule, sessions, today);
    if (!next) {
      return null;
    }
    const done = todays.length > 0;
    const [first] = next.sessions as [WeekSession, ...WeekSession[]];
    const when =
      next.inDays === 1
        ? t('today.workout.nextTomorrow')
        : t('today.workout.nextOn', { day: weekdayName(next.weekday) });
    return (
      // The whole card opens the next workout too; screen readers find that on its button alone.
      <Pressable
        accessible={false}
        onPress={() => openWorkout(first)}
        style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
      >
        <Card entering={entering}>
          <PlanRow
            icon={done ? 'check' : 'moon'}
            color="breakfast"
            background="breakfastBackground"
            caption={t(done ? 'today.workout.doneNext' : 'today.workout.restDayNext', { when })}
            title={next.sessions.map(workoutName).join(', ')}
            actionIcon="forward"
            actionLabel={t('today.workout.openNextLabel')}
            onAction={() => openWorkout(first)}
          >
            <Text variant="caption" color="textMuted">
              {next.sessions.length === 1 ? sessionSize(first) : sessionsSize(next.sessions)}
            </Text>
          </PlanRow>
        </Card>
      </Pressable>
    );
  }

  if (todays.length === 1) {
    const [{ session, movedFrom }] = ahead as [PlannedWorkout];
    return (
      // The whole card opens the workout too; screen readers find that on its button alone.
      <Pressable
        accessible={false}
        onPress={() => openWorkout(session)}
        style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
      >
        <Card entering={entering}>
          <PlanRow
            icon="dumbbell"
            color="breakfast"
            background="breakfastBackground"
            caption={t('today.workout.title')}
            title={workoutName(session)}
            actionIcon="forward"
            actionLabel={t('today.workout.openLabel')}
            onAction={() => openWorkout(session)}
          >
            <Text variant="caption" color="textMuted">
              {sessionSize(session)}
            </Text>
            {movedFrom ? <MovedFrom date={movedFrom} /> : null}
          </PlanRow>
        </Card>
      </Pressable>
    );
  }

  const done = todays.length - ahead.length;
  return (
    <Card entering={entering}>
      <View style={styles.text}>
        <Text variant="caption" color="breakfast">
          {t('today.workout.titleMany')}
        </Text>
        <Text variant="headline">{t('today.workout.doneOf', { done, count: todays.length })}</Text>
      </View>
      {todays.map(({ session, status, movedFrom }) => {
        const content = (
          <View
            style={[
              styles.row,
              { gap: spacing.md, paddingTop: spacing.md, borderTopWidth: 1 },
              { borderTopColor: colors.border },
            ]}
          >
            {status === 'done' ? (
              <View style={[styles.doneMark, { backgroundColor: colors.primaryButton }]}>
                <Icon name="check" size={18} color="onPrimary" />
              </View>
            ) : (
              <IconTile name="dumbbell" color="breakfast" background="breakfastBackground" />
            )}
            <View style={styles.text}>
              <Text variant="bodyStrong">{workoutName(session)}</Text>
              {movedFrom && status !== 'done' ? <MovedFrom date={movedFrom} /> : null}
              <Text variant="caption" color="textMuted">
                {status === 'done' ? t('today.workout.finished') : sessionSize(session)}
              </Text>
            </View>
            {status === 'done' ? null : <Icon name="forward" color="textMuted" />}
          </View>
        );
        return status === 'done' ? (
          <View key={session.workoutId}>{content}</View>
        ) : (
          <Pressable
            key={session.workoutId}
            accessibilityRole="button"
            accessibilityHint={t('today.workout.open')}
            onPress={() => openWorkout(session)}
            style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
          >
            {content}
          </Pressable>
        );
      })}
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
  doneMark: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
