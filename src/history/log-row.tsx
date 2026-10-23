import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { Icon } from '@/components/ui/icon';
import { IconStat } from '@/components/ui/icon-stat';
import { Text } from '@/components/ui/text';
import { useWeekdayFormat } from '@/i18n/dates';
import { fonts, useTheme } from '@/theme';
import { useWorkoutName } from '@/workouts/format';

import { useDurationFormat } from './format';
import { doneOf, durationMinutes, type LogSummary } from './history';

type LogRowProps = {
  log: LogSummary;
  divider: boolean;
  /** Stats with coloured icons, as on the history screen; plain text beside the workouts. */
  icons?: boolean;
};

/** A finished workout in a list: its day, name, length, sets and calories. Opens the workout. */
export function LogRow({ log, divider, icons = false }: LogRowProps) {
  const { t } = useTranslation();
  const { colors, radii, spacing } = useTheme();
  const weekday = useWeekdayFormat('short');
  const workoutName = useWorkoutName();
  const duration = useDurationFormat();
  const partly = (done: number, planned: number | null) => planned !== null && done < planned;
  const exercisesLabel = partly(log.exercises, log.plannedExercises)
    ? t('history.exercisesOf', { done: log.exercises, count: log.plannedExercises })
    : t('workout.size.exercises', { count: log.exercises });
  const setsLabel = partly(log.sets, log.plannedSets)
    ? t('history.setsOf', { done: log.sets, count: log.plannedSets })
    : t('history.sets', { count: log.sets });

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityHint={t('history.open')}
      onPress={() => router.push({ pathname: '/workout/log/[id]', params: { id: String(log.id) } })}
      style={({ pressed }) => [
        styles.row,
        {
          gap: spacing.md,
          borderTopWidth: divider ? 1 : 0,
          borderTopColor: colors.border,
          opacity: pressed ? 0.6 : 1,
        },
      ]}
    >
      <View style={[styles.date, { borderRadius: radii.md, backgroundColor: colors.selected }]}>
        <Text variant="caption" color="primaryText" style={[styles.bold, styles.weekday]}>
          {weekday(log.startedAt.getDay() || 7).toLocaleUpperCase()}
        </Text>
        <Text variant="headline" style={styles.day}>
          {log.startedAt.getDate()}
        </Text>
      </View>
      <View style={[styles.flex, { gap: 2 }]}>
        <Text variant="bodyStrong" numberOfLines={1} style={styles.bold}>
          {workoutName(log)}
        </Text>
        {icons ? (
          <View style={[styles.stats, { gap: spacing.md }]}>
            <IconStat
              icon="dumbbell"
              color="info"
              text={doneOf(log.exercises, log.plannedExercises)}
              label={exercisesLabel}
            />
            <IconStat
              icon="target"
              color="fat"
              text={doneOf(log.sets, log.plannedSets)}
              label={setsLabel}
            />
            <IconStat icon="timer" color="primaryText" text={duration(durationMinutes(log))} />
            {log.estimatedKcal !== null ? (
              <IconStat
                icon="flame"
                color="primary"
                text={t('history.kcal', { kcal: log.estimatedKcal })}
              />
            ) : null}
          </View>
        ) : (
          <Text variant="caption" color="textMuted" numberOfLines={1}>
            {[
              duration(durationMinutes(log)),
              t('history.sets', { count: log.sets }),
              log.estimatedKcal !== null ? t('history.kcal', { kcal: log.estimatedKcal }) : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </Text>
        )}
      </View>
      <Icon name="forward" size={18} color="textMuted" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  stats: {
    flexDirection: 'row',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
  },
  flex: {
    flex: 1,
  },
  bold: {
    fontFamily: fonts.extraBold,
  },
  date: {
    width: 48,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekday: {
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 0.4,
  },
  day: {
    lineHeight: 24,
  },
});
