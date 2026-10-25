import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { Card } from '@/components/ui/card';
import { CardHeading } from '@/components/ui/card-heading';
import { Text } from '@/components/ui/text';
import type { LibraryExercise } from '@/exercises/library';
import { useClockFormat } from '@/i18n/dates';
import { useNumberFormat } from '@/i18n/units';
import { summarizeSets } from '@/sets/exercise-summary';
import { describeSet, setKindOf } from '@/sets/fields';
import { useRecordFormat } from '@/sets/records';
import { fonts, useTheme } from '@/theme';
import { workoutLength } from '@/workouts/format';

import { newRecords } from './records';
import type { sessionTotals, Session } from './session';

/** Looks an exercise of the workout up in the library. */
type Details = (exerciseId: string) => LibraryExercise | undefined;

/** How long the workout took, its sets and the weight lifted, in three boxes. */
export function FinishStats({
  session,
  totals,
  finishedAt,
}: {
  session: Session;
  totals: ReturnType<typeof sessionTotals>;
  finishedAt: number;
}) {
  const { t } = useTranslation();
  const { colors, radii, spacing } = useTheme();
  const { format } = useNumberFormat();
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
  const { t } = useTranslation();
  const { colors, radii, spacing } = useTheme();
  const time = useClockFormat();
  return (
    <View style={{ gap: spacing.xs }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('session.end.change', { time: time(finishedAt) })}
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
            {t('session.end.label', { started: time(startedAt) })}
          </Text>
          <Text variant="label" style={styles.tabular}>
            {time(finishedAt)}
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
export function ExerciseSummary({ session, details }: { session: Session; details: Details }) {
  const { t } = useTranslation();
  const { colors, spacing } = useTheme();
  return (
    <Card list>
      {session.exercises.map((exercise, index) => {
        const info = details(exercise.exerciseId);
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
export function NewRecords({ session, details }: { session: Session; details: Details }) {
  const { t } = useTranslation();
  const { spacing } = useTheme();
  const formatRecord = useRecordFormat();
  const records = session.exercises.flatMap((exercise) => {
    const info = details(exercise.exerciseId);
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
      <CardHeading icon="trophy" title={t('session.summary.records', { count: records.length })} />
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
  record: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  semibold: {
    fontFamily: fonts.bold,
  },
});
