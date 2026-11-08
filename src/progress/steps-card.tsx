import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { RangeControl } from '@/components/range-control';
import { Card, type CardProps } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { addDays, toIsoDate, useMonthDayFormat, weekStart } from '@/i18n/dates';
import { useNumberFormat } from '@/i18n/units';
import { rangeStart, type ProgressRange } from '@/lib/ranges';
import { averageSteps, pastDays, useStepDays, type StepDay } from '@/steps/steps';
import { fonts, useTheme } from '@/theme';

import { CardLoadState } from '@/components/card-load-state';

const CHART_HEIGHT = 110;

type StepsCardProps = {
  entering?: CardProps['entering'];
  today: Date;
};

/** A bar of the chart: a day's steps, or a week's average a day over a longer range. */
type Bar = { from: Date; steps: number };

/** A bar a day over a month, a bar a week over longer ranges, so that the bars stay readable. */
function bars(range: ProgressRange, start: Date, today: Date, days: readonly StepDay[]): Bar[] {
  const byDay = new Map(days.map(({ day, steps }) => [day, steps]));
  const length = range === 'month' ? 1 : 7;
  const result: Bar[] = [];
  for (let from = range === 'month' ? start : weekStart(start); from <= today;) {
    const to = addDays(from, length);
    const counted: StepDay[] = [];
    for (let day = from; day < to && day <= today; day = addDays(day, 1)) {
      const steps = byDay.get(toIsoDate(day));
      if (steps !== undefined) counted.push({ day: toIsoDate(day), steps });
    }
    result.push({ from, steps: averageSteps(counted) ?? 0 });
    from = to;
  }
  return result;
}

/**
 * The steps a day over a range (#469): the average a day against the range before, and a chart of
 * the days, or of the weeks over longer ranges, with the range to choose under it.
 */
export function StepsCard({ entering, today }: StepsCardProps) {
  const { t } = useTranslation();
  const { colors, spacing } = useTheme();
  const { format } = useNumberFormat();
  const monthDay = useMonthDayFormat();
  const [range, setRange] = useState<ProgressRange>('month');
  const start = rangeStart(range, today);
  const days = useStepDays(start, today);
  const before = addDays(start, -1);
  const last = useStepDays(rangeStart(range, before), before);

  let content;
  if (days.data === undefined) {
    content = <CardLoadState query={days} error={t('progress.steps.error')} />;
  } else if (days.data.length === 0) {
    content = (
      <Text variant="caption" color="textMuted">
        {t('progress.steps.none')}
      </Text>
    );
  } else {
    // Today is still being counted, so the average is of the days that are over, or of today alone
    // before any is.
    const average = Math.round(
      averageSteps(pastDays(days.data, today)) ?? averageSteps(days.data) ?? 0,
    );
    const lastAverage =
      last.data && !last.isPlaceholderData && !days.isPlaceholderData
        ? averageSteps(last.data)
        : null;
    const lastRounded = lastAverage === null ? null : Math.round(lastAverage);
    const change = lastRounded === null ? 0 : average - lastRounded;
    const chart = bars(range, start, today, days.data);
    const most = Math.max(1, ...chart.map(({ steps }) => steps));
    content = (
      <>
        <View style={{ gap: spacing.xs }}>
          <Text style={styles.value}>
            {format(average)}{' '}
            <Text variant="label" color="textMuted">
              {t('progress.steps.average')}
            </Text>
          </Text>
          {change !== 0 ? (
            <Text variant="captionStrong" color={change > 0 ? 'success' : 'textMuted'}>
              {t(change > 0 ? 'progress.steps.more' : 'progress.steps.fewer', {
                steps: format(Math.abs(change)),
              })}
            </Text>
          ) : null}
        </View>
        <View
          accessible
          accessibilityRole="image"
          accessibilityLabel={t('progress.steps.chartLabel', {
            from: monthDay(start),
            to: monthDay(today),
            average: format(average),
          })}
          style={[
            styles.chart,
            { height: CHART_HEIGHT, gap: chart.length > 40 ? 1 : 3, borderColor: colors.border },
          ]}
        >
          {chart.map(({ from, steps }, index) => (
            <View
              key={from.toISOString()}
              style={[
                styles.bar,
                {
                  height: Math.max(2, (steps / most) * CHART_HEIGHT),
                  backgroundColor: colors.info,
                  // The last bar is still being counted.
                  opacity: index === chart.length - 1 ? 0.4 : 1,
                },
              ]}
            />
          ))}
        </View>
        <View style={styles.axis} importantForAccessibility="no-hide-descendants">
          <Text variant="caption" color="textMuted">
            {monthDay(start)}
          </Text>
          <Text variant="caption" color="textMuted">
            {monthDay(today)}
          </Text>
        </View>
      </>
    );
  }

  return (
    <Card entering={entering}>
      <Text variant="headline" accessibilityRole="header">
        {t('progress.steps.title')}
      </Text>
      {content}
      <RangeControl
        value={range}
        onChange={setRange}
        accessibilityLabel={t('progress.steps.rangeLabel')}
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  axis: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  bar: {
    borderTopLeftRadius: 3,
    borderTopRightRadius: 3,
    flex: 1,
  },
  chart: {
    alignItems: 'flex-end',
    borderBottomWidth: 1,
    flexDirection: 'row',
  },
  value: {
    fontFamily: fonts.black,
    fontSize: 30,
    lineHeight: 36,
  },
});
