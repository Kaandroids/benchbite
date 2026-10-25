import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { Card } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { findExercise, useExerciseLibrary } from '@/exercises/library';
import { useNumberFormat } from '@/i18n/units';
import { summarizeSets } from '@/sets/exercise-summary';
import { describeSet, setKindOf } from '@/sets/fields';
import { useRecordFormat } from '@/sets/records';
import { fonts, useTheme } from '@/theme';
import { workoutLength } from '@/workouts/format';

import { newRecords } from './records';
import { sessionTotals, type Session } from './session';

/** How long the workout took, its sets and the weight lifted, in three boxes. */
export function FinishStats({ session, finishedAt }: { session: Session; finishedAt: number }) {
  const { t } = useTranslation();
  const { colors, radii, spacing } = useTheme();
  const { format } = useNumberFormat();
  const totals = sessionTotals(session);
  const seconds = Math.max(0, Math.floor((finishedAt - session.startedAt) / 1000));
  const stats = [
    { value: workoutLength(seconds), label: t('session.summary.time') },
    {
      value:
        totals.done === totals.planned ? String(totals.done) : `${totals.done} / ${totals.planned}`,
      label: t('session.summary.sets'),
    },
    { value: format(Math.round(totals.kilograms)), label: t('session.summary.kilograms') },
  ];
  return (
    <View style={[styles.row, { gap: spacing.sm }]}>
      {stats.map((stat) => (
        <View
          key={stat.label}
          style={[
            styles.stat,
            {
              borderRadius: radii.md,
              backgroundColor: colors.surface,
              borderColor: colors.border,
              padding: spacing.sm,
            },
          ]}
        >
          <Text variant="headline" style={styles.tabular}>
            {stat.value}
          </Text>
          <Text variant="caption" color="textMuted">
            {stat.label}
          </Text>
        </View>
      ))}
    </View>
  );
}

/** When the workout started and ended, with a button to change the end. */
export function EndTime({
  startedAt,
  finishedAt,
  onChange,
}: {
  startedAt: number;
  finishedAt: number;
  onChange: () => void;
}) {
  const { t, i18n } = useTranslation();
  const { colors, radii, spacing } = useTheme();
  const time = new Intl.DateTimeFormat(i18n.language, { timeStyle: 'short' });
  return (
    <View style={{ gap: spacing.xs }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('session.end.change', { time: time.format(finishedAt) })}
        onPress={onChange}
        style={[
          styles.end,
          {
            gap: spacing.md,
            paddingHorizontal: spacing.lg,
            borderRadius: radii.md,
            backgroundColor: colors.surface,
            borderColor: colors.border,
          },
        ]}
      >
        <View style={styles.flex}>
          <Text variant="caption" color="textMuted">
            {t('session.end.label', { started: time.format(startedAt) })}
          </Text>
          <Text variant="label" style={styles.tabular}>
            {time.format(finishedAt)}
          </Text>
        </View>
        <Text variant="label" color="primaryText">
          {t('session.end.changeLabel')}
        </Text>
      </Pressable>
      <Text variant="caption" color="textMuted">
        {t('session.end.hint')}
      </Text>
    </View>
  );
}

/** Each exercise of the workout with its sets done and the best of them, or that it was skipped. */
export function ExerciseSummary({ session }: { session: Session }) {
  const { t } = useTranslation();
  const { colors, spacing } = useTheme();
  const library = useExerciseLibrary();
  return (
    <Card list>
      {session.exercises.map((exercise, index) => {
        const info = findExercise(library.data, exercise.exerciseId);
        const done = exercise.sets.filter((s) => s.done);
        const kind = setKindOf(info?.metrics, exercise.target);
        const { best } = summarizeSets(done, kind);
        const sets =
          done.length === exercise.sets.length
            ? t('common.sets', { count: done.length })
            : t('session.setsDone', { done: done.length, count: exercise.sets.length });
        return (
          <View
            key={index}
            style={[
              styles.item,
              { gap: spacing.sm, borderTopWidth: index > 0 ? 1 : 0, borderTopColor: colors.border },
            ]}
          >
            <Text variant="bodyStrong" style={styles.flex} numberOfLines={1}>
              {info?.name ?? ''}
            </Text>
            <Text variant="captionStrong" color="textMuted">
              {done.length === 0
                ? t('session.summary.skipped')
                : [sets, best ? describeSet(best, kind) : null].filter(Boolean).join(' · ')}
            </Text>
          </View>
        );
      })}
    </Card>
  );
}

/** The best new record of each kind for every exercise, in the workout's order; none without. */
export function NewRecords({ session }: { session: Session }) {
  const { t } = useTranslation();
  const { spacing } = useTheme();
  const library = useExerciseLibrary();
  const formatRecord = useRecordFormat();
  const records = session.exercises.flatMap((exercise) => {
    const info = findExercise(library.data, exercise.exerciseId);
    const kind = setKindOf(info?.metrics, exercise.target);
    return newRecords(exercise.sets, kind, exercise.bests).records.map((record) => ({
      name: `${info?.name ?? ''} · ${t(`exerciseHistory.kinds.${record.kind}`)}`,
      value: formatRecord(record),
    }));
  });
  if (records.length === 0) {
    return null;
  }
  return (
    <Card style={{ padding: spacing.lg, gap: spacing.sm }}>
      <View style={[styles.item, styles.title, { gap: spacing.sm }]}>
        <Icon name="trophy" size={18} color="primary" />
        <Text variant="bodyStrong" style={styles.black}>
          {t('session.summary.records', { count: records.length })}
        </Text>
      </View>
      {records.map((record) => (
        <View key={record.name} style={[styles.record, { gap: spacing.md }]}>
          <Text variant="body" style={[styles.flex, styles.semibold]}>
            {record.name}
          </Text>
          <Text variant="label" color="primaryText">
            {record.value}
          </Text>
        </View>
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
  },
  flex: {
    flex: 1,
  },
  stat: {
    flex: 1,
    alignItems: 'center',
    borderWidth: 1,
  },
  tabular: {
    fontVariant: ['tabular-nums'],
  },
  end: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
  },
  title: {
    paddingVertical: 0,
  },
  record: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  semibold: {
    fontFamily: fonts.bold,
  },
  black: {
    fontFamily: fonts.black,
    fontSize: 17,
  },
});
