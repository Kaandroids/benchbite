import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { FadeInDown } from 'react-native-reanimated';

import { Card } from '@/components/ui/card';
import { IconTile } from '@/components/ui/icon-tile';
import { Text } from '@/components/ui/text';
import { useExerciseNames } from '@/exercises/use-exercise-names';
import { useWeekdayFormat } from '@/i18n/dates';
import { nextSession } from '@/plan/next-session';
import { useTheme } from '@/theme';
import type { Plan } from '@shared/plan/types';

/** Exercise names listed before "+n more". */
const NAMES_SHOWN = 4;

type WorkoutCardProps = {
  plan: Plan;
  today: Date;
};

/** Today's workout with its exercises, or on a rest day, when the next workout is. */
export function WorkoutCard({ plan, today }: WorkoutCardProps) {
  const { t } = useTranslation();
  const { spacing } = useTheme();
  const weekdayName = useWeekdayFormat();
  const upcoming = nextSession(plan, today);
  const session = upcoming?.inDays === 0 ? upcoming.session : null;
  const names = useExerciseNames(session?.exercises.map((exercise) => exercise.exerciseId) ?? []);

  if (!upcoming) {
    return null;
  }

  if (!session) {
    const { inDays, session: next } = upcoming;
    return (
      <Card entering={FadeInDown.delay(100).duration(400)}>
        <View style={[styles.row, { gap: spacing.md }]}>
          <IconTile name="moon" />
          <View style={styles.text}>
            <Text variant="headline">{t('today.workout.restDay')}</Text>
            <Text color="textMuted">
              {t('today.workout.next', {
                day: inDays === 1 ? t('today.workout.tomorrow') : weekdayName(next.weekday),
                session: t(`workout.sessionTypes.${next.type}`),
              })}
            </Text>
          </View>
        </View>
      </Card>
    );
  }

  const exerciseNames = session.exercises.map((exercise) => names[exercise.exerciseId] ?? '');
  const shown = exerciseNames.slice(0, NAMES_SHOWN).filter(Boolean);
  const hidden = exerciseNames.length - NAMES_SHOWN;

  return (
    <Card entering={FadeInDown.delay(100).duration(400)}>
      <View style={[styles.row, { gap: spacing.md }]}>
        <IconTile name="dumbbell" />
        <View style={styles.text}>
          <Text variant="caption" color="primaryText">
            {t('today.workout.title')}
          </Text>
          <Text variant="headline">{t(`workout.sessionTypes.${session.type}`)}</Text>
        </View>
      </View>
      <Text color="textMuted">
        {t('workout.session', {
          count: session.exercises.length,
          minutes: session.estimatedMinutes,
        })}
      </Text>
      {shown.length > 0 ? (
        <View style={{ gap: spacing.xs }}>
          {shown.map((name, index) => (
            <Text key={index} variant="bodyStrong">
              {name}
            </Text>
          ))}
          {hidden > 0 ? (
            <Text variant="caption" color="textMuted">
              {t('workout.more', { count: hidden })}
            </Text>
          ) : null}
        </View>
      ) : null}
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
