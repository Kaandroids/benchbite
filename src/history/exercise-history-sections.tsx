import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { Card } from '@/components/ui/card';
import { CardHeading } from '@/components/ui/card-heading';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Text } from '@/components/ui/text';
import { useShortDateFormat } from '@/i18n/dates';
import { shortSet, summarizeSets } from '@/sets/exercise-summary';
import { describeSet, type SetKind } from '@/sets/fields';
import { useRecordFormat } from '@/sets/records';
import { SetChips } from '@/sets/set-chips';
import { fonts, useTheme } from '@/theme';
import { useWorkoutName } from '@/workouts/format';

import { DateTile } from './date-tile';
import {
  recordSets,
  type ExerciseRecord,
  type ExerciseSession,
  type ProgressPoint,
} from './exercise-history';
import { useTotalFormat } from './format';
import { ProgressChart } from './progress-chart';
import {
  defaultRange,
  lowerIsBetter,
  metricsOf,
  pointsIn,
  pointsOf,
  scaleOf,
  TIME_RANGES,
  useMetricFormat,
  type ProgressMetric,
  type TimeRange,
} from './record-format';

/** The exercise's records, each with when it was set. */
export function RecordsCard({ records, kind }: { records: ExerciseRecord[]; kind: SetKind }) {
  const { t } = useTranslation();
  const { colors, radii, spacing } = useTheme();
  const formatRecord = useRecordFormat();
  const day = useShortDateFormat(new Date());
  const label = (record: ExerciseRecord) =>
    record.kind === 'heaviest' && kind.addedWeight
      ? t('exerciseHistory.kinds.heaviestAdded')
      : t(`exerciseHistory.kinds.${record.kind}`);
  return (
    <Card>
      <CardHeading icon="trophy" title={t('exerciseHistory.records')} />
      <View style={[styles.grid, { gap: spacing.sm }]}>
        {records.map((record) => (
          <View
            key={record.kind}
            style={[
              styles.record,
              { padding: spacing.md, borderRadius: radii.md, backgroundColor: colors.background },
            ]}
          >
            <Text variant="captionStrong" color="textMuted">
              {label(record)}
            </Text>
            <Text variant="headline" style={styles.tabular}>
              {formatRecord(record)}
            </Text>
            <Text variant="caption" color="textMuted" style={styles.semibold}>
              {/* An estimate says which set it comes from. */}
              {record.kind === 'one_rep_max'
                ? `${shortSet(record.set, kind, (set) => describeSet(set, kind))} · ${day(record.achievedAt)}`
                : day(record.achievedAt)}
            </Text>
          </View>
        ))}
      </View>
      {records.some((record) => record.kind === 'one_rep_max') ? (
        <Text variant="caption" color="textMuted">
          {t('exerciseHistory.oneRepMaxNote')}
        </Text>
      ) : null}
    </Card>
  );
}

/**
 * A chart of one of the exercise's measures over a time range, both to choose, with the change
 * since the first workout shown. None without any workout to show.
 */
export function ProgressCard({ progress, kind }: { progress: ProgressPoint[]; kind: SetKind }) {
  const { t } = useTranslation();
  const { colors, radii, spacing } = useTheme();
  const formatMetric = useMetricFormat();
  const [chosen, setChosen] = useState<ProgressMetric | null>(null);
  const [chosenRange, setChosenRange] = useState<TimeRange | null>(null);
  const today = new Date();
  const day = useShortDateFormat(today);

  const metrics = metricsOf(kind);
  const metric = chosen && metrics.includes(chosen) ? chosen : metrics[0];
  const allPoints = pointsOf(progress, metric);
  if (allPoints.length === 0) {
    return null;
  }
  const range = chosenRange ?? defaultRange(allPoints, today);
  const points = pointsIn(allPoints, range, today);
  const first = points[0];
  const last = points[points.length - 1];
  const change = last && first && points.length > 1 ? last.value - first.value : 0;

  // The chart in a sentence for screen readers, however many workouts it shows.
  const values = points.map((point) => point.value);
  const description =
    first && last
      ? t('exerciseHistory.chartSummary', {
          count: points.length,
          metric: t(`exerciseHistory.metrics.${metric}`),
          from: day(first.date),
          to: day(last.date),
          lowest: formatMetric.value(metric, Math.min(...values)),
          highest: formatMetric.value(metric, Math.max(...values)),
          latest: formatMetric.value(metric, last.value),
        })
      : '';

  return (
    <Card>
      <CardHeading icon="trend" title={t('exerciseHistory.progress')}>
        {change !== 0 && first ? (
          <Text variant="caption" color="textMuted" style={styles.semibold}>
            {t('exerciseHistory.since', {
              change: `${change > 0 ? '+' : '−'}${formatMetric.value(metric, Math.abs(change))}`,
              date: day(first.date),
            })}
          </Text>
        ) : null}
      </CardHeading>
      <View
        accessibilityRole="radiogroup"
        accessibilityLabel={t('exerciseHistory.metricsLabel')}
        style={[styles.row, { gap: spacing.xs }]}
      >
        {metrics.map((option) => {
          const selected = option === metric;
          return (
            <Pressable
              key={option}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              onPress={() => setChosen(option)}
              style={({ pressed }) => [
                styles.metric,
                {
                  paddingHorizontal: spacing.md,
                  borderRadius: radii.full,
                  backgroundColor: selected ? colors.text : colors.background,
                  opacity: pressed ? 0.6 : 1,
                },
              ]}
            >
              <Text variant="captionStrong" color={selected ? 'surface' : 'textMuted'}>
                {t(`exerciseHistory.metrics.${option}`)}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {points.length > 0 ? (
        <ProgressChart
          points={points}
          formatValue={(value) => formatMetric.value(metric, value)}
          formatTick={(value) => formatMetric.tick(metric, value)}
          scale={scaleOf(metric)}
          inverted={lowerIsBetter(metric)}
          description={description}
        />
      ) : (
        <View style={styles.noPoints}>
          <Text color="textMuted" align="center">
            {t('exerciseHistory.noWorkoutsInRange')}
          </Text>
        </View>
      )}
      <SegmentedControl
        options={TIME_RANGES.map((value) => ({
          value,
          label: t(`exerciseHistory.ranges.${value}`),
        }))}
        value={range}
        onChange={setChosenRange}
        accessibilityLabel={t('exerciseHistory.rangeLabel')}
      />
    </Card>
  );
}

/** The latest workouts with the exercise, each with its sets and the records in them marked. */
export function SessionList({
  sessions,
  records,
  kind,
}: {
  sessions: ExerciseSession[];
  records: ExerciseRecord[];
  kind: SetKind;
}) {
  const { t } = useTranslation();
  const { colors, spacing } = useTheme();
  const workoutName = useWorkoutName();
  const formatTotal = useTotalFormat();
  const marked = recordSets(records, sessions);
  return (
    <Card list>
      {sessions.map((session, index) => (
        <Pressable
          key={session.logId}
          accessibilityRole="button"
          accessibilityHint={t('history.open')}
          onPress={() =>
            router.push({ pathname: '/workout/log/[id]', params: { id: String(session.logId) } })
          }
          style={({ pressed }) => [
            styles.session,
            {
              gap: spacing.md,
              paddingVertical: spacing.md,
              borderTopWidth: index > 0 ? 1 : 0,
              borderTopColor: colors.border,
              opacity: pressed ? 0.6 : 1,
            },
          ]}
        >
          <DateTile date={session.startedAt} tinted={false} />
          <View style={[styles.flex, { gap: spacing.xs }]}>
            <Text variant="label" numberOfLines={1}>
              {workoutName(session)}
              <Text variant="bodyStrong" color="textMuted" style={styles.semibold}>
                {` · ${formatTotal(summarizeSets(session.sets, kind).total)}`}
              </Text>
            </Text>
            <SetChips
              sets={session.sets.map((set) => ({
                text: shortSet(set, kind, (values) => describeSet(values, kind)),
              }))}
              marked={(index) => marked.get(session.logId)?.has(index) ?? false}
              markLabel={t('exerciseHistory.record')}
            />
          </View>
        </Pressable>
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  semibold: {
    fontFamily: fonts.bold,
  },
  tabular: {
    fontVariant: ['tabular-nums'],
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  record: {
    flexGrow: 1,
    flexBasis: '45%',
    gap: 2,
  },
  noPoints: {
    height: 150,
    justifyContent: 'center',
  },
  metric: {
    height: 32,
    justifyContent: 'center',
  },
  session: {
    flexDirection: 'row',
  },
});
