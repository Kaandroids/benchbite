import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { allLoaded, LoadState } from '@/components/load-state';
import { Icon } from '@/components/ui/icon';
import { MessageView } from '@/components/ui/message-view';
import { Screen } from '@/components/ui/screen';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Text } from '@/components/ui/text';
import { useExerciseLibrary, findExercise } from '@/exercises/library';
import { useShortDateFormat } from '@/i18n/dates';
import { shortSet, summarizeSets } from '@/sets/exercise-summary';
import { describeSet, setKindOf } from '@/sets/fields';
import { useRecordFormat } from '@/sets/records';
import { fonts, useTheme } from '@/theme';
import { useWorkoutName } from '@/workouts/format';

import { DateTile } from './date-tile';
import { recordSets, useExerciseHistory, type ExerciseRecord } from './exercise-history';
import { useTotalFormat } from './format';
import { ProgressChart } from './progress-chart';
import {
  lowerIsBetter,
  metricsOf,
  pointsOf,
  defaultRange,
  pointsIn,
  scaleOf,
  TIME_RANGES,
  useMetricFormat,
  type ProgressMetric,
  type TimeRange,
} from './record-format';

/** An exercise's records, a chart of its progress, and its sets in the workouts it was done in. */
export function ExerciseHistoryScreen({ id }: { id: string }) {
  const { t } = useTranslation();
  const { colors, radii, spacing } = useTheme();
  const history = useExerciseHistory(id);
  const library = useExerciseLibrary();
  const formatRecord = useRecordFormat();
  const formatMetric = useMetricFormat();
  const workoutName = useWorkoutName();
  const formatTotal = useTotalFormat();
  const [chosen, setChosen] = useState<ProgressMetric | null>(null);
  const [chosenRange, setChosenRange] = useState<TimeRange | null>(null);
  const today = new Date();
  const day = useShortDateFormat(today);

  const exercise = findExercise(library.data, id);
  const title = (
    <>
      <Text variant="label" accessibilityRole="header" numberOfLines={1}>
        {exercise?.name ?? ''}
      </Text>
      <Text variant="caption" color="textMuted" numberOfLines={1}>
        {t('exerciseHistory.subtitle')}
      </Text>
    </>
  );

  if (!allLoaded([history, library])) {
    return (
      <Screen onBack={() => router.back()}>
        <LoadState queries={[history, library]} />
      </Screen>
    );
  }
  const { records, progress, sessions } = history.data ?? {
    records: [],
    progress: [],
    sessions: [],
  };
  if (sessions.length === 0) {
    return (
      <Screen onBack={() => router.back()} title={title}>
        <MessageView
          icon="trophy"
          title={t('exerciseHistory.empty.title')}
          message={t('exerciseHistory.empty.message')}
        />
      </Screen>
    );
  }

  // An exercise no longer in the library is read from how its sets were logged.
  const sample = sessions[0]?.sets[0];
  const kind = setKindOf(
    exercise?.metrics,
    sample && sample.reps === null
      ? { seconds: sample.seconds, meters: sample.meters }
      : { reps: { min: 1, max: 1 } },
  );
  const metrics = metricsOf(kind);
  const metric = chosen && metrics.includes(chosen) ? chosen : metrics[0];
  const allPoints = pointsOf(progress, metric);
  const range = chosenRange ?? defaultRange(allPoints, today);
  const points = pointsIn(allPoints, range, today);
  const first = points[0];
  const last = points[points.length - 1];
  const change = last && first && points.length > 1 ? last.value - first.value : 0;
  const marked = recordSets(records, sessions);

  const recordLabel = (record: ExerciseRecord) =>
    record.kind === 'heaviest' && kind.addedWeight
      ? t('exerciseHistory.kinds.heaviestAdded')
      : t(`exerciseHistory.kinds.${record.kind}`);

  const total = (sets: (typeof sessions)[number]['sets']) =>
    formatTotal(summarizeSets(sets, kind).total);

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

  const card = [
    styles.card,
    {
      gap: spacing.md,
      padding: spacing.lg,
      borderRadius: radii.lg,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
  ];

  return (
    <Screen onBack={() => router.back()} title={title}>
      {records.length > 0 ? (
        <View style={card}>
          <View style={[styles.row, { gap: spacing.sm }]}>
            <Icon name="trophy" size={18} color="primary" />
            <Text variant="headline" style={styles.cardTitle}>
              {t('exerciseHistory.records')}
            </Text>
          </View>
          <View style={[styles.grid, { gap: spacing.sm }]}>
            {records.map((record) => (
              <View
                key={record.kind}
                style={[
                  styles.record,
                  {
                    padding: spacing.md,
                    borderRadius: radii.md,
                    backgroundColor: colors.background,
                  },
                ]}
              >
                <Text variant="captionStrong" color="textMuted">
                  {recordLabel(record)}
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
        </View>
      ) : null}

      {allPoints.length > 0 ? (
        <View style={card}>
          <View style={[styles.row, { gap: spacing.sm }]}>
            <Icon name="trend" size={18} color="primary" />
            <Text variant="headline" style={[styles.cardTitle, styles.flex]}>
              {t('exerciseHistory.progress')}
            </Text>
            {change !== 0 && first ? (
              <Text variant="caption" color="textMuted" style={styles.semibold}>
                {t('exerciseHistory.since', {
                  change: `${change > 0 ? '+' : '−'}${formatMetric.value(metric, Math.abs(change))}`,
                  date: day(first.date),
                })}
              </Text>
            ) : null}
          </View>
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
        </View>
      ) : null}

      <Text variant="label" color="textMuted" style={[{ paddingHorizontal: 4 }]}>
        {t('exerciseHistory.sessions', { count: progress.length })}
      </Text>
      <View
        style={[
          styles.card,
          {
            paddingHorizontal: spacing.lg,
            borderRadius: radii.lg,
            borderColor: colors.border,
            backgroundColor: colors.surface,
          },
        ]}
      >
        {sessions.map((session, index) => (
          <Pressable
            key={session.logId}
            accessibilityRole="button"
            accessibilityHint={t('history.open')}
            onPress={() =>
              router.push({
                pathname: '/workout/log/[id]',
                params: { id: String(session.logId) },
              })
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
                  {` · ${total(session.sets)}`}
                </Text>
              </Text>
              <View style={[styles.chips, { gap: spacing.xs }]}>
                {session.sets.map((set, setIndex) => {
                  const record = marked.get(session.logId)?.has(setIndex) ?? false;
                  const text = shortSet(set, kind, (values) => describeSet(values, kind));
                  return (
                    <View
                      key={setIndex}
                      accessibilityLabel={
                        record ? `${t('exerciseHistory.record')}: ${text}` : undefined
                      }
                      style={[
                        styles.chip,
                        {
                          borderRadius: radii.md,
                          backgroundColor: record ? colors.selected : colors.background,
                        },
                      ]}
                    >
                      <Text
                        variant="captionStrong"
                        color={record ? 'primaryText' : 'text'}
                        style={[styles.tabular]}
                      >
                        {text}
                      </Text>
                    </View>
                  );
                })}
              </View>
            </View>
          </Pressable>
        ))}
      </View>
    </Screen>
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
  cardTitle: {
    fontFamily: fonts.black,
    fontSize: 17,
    lineHeight: 22,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  card: {
    borderWidth: 1,
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
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
});
