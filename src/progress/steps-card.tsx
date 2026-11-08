import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { CardLoadState } from '@/components/card-load-state';
import { RangeControl } from '@/components/range-control';
import { Card, type CardProps } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { addDays, toIsoDate, useMonthDayFormat } from '@/i18n/dates';
import { useNumberFormat } from '@/i18n/units';
import { rangeStart, type ProgressRange } from '@/lib/ranges';
import { averageSteps, pastDays, useStepDays, type StepDay } from '@/steps/steps';
import { fonts, useTheme } from '@/theme';

import { SPAN_OF, spanStart, type Span } from './spans';

const CHART_HEIGHT = 110;

type StepsCardProps = {
  entering?: CardProps['entering'];
  today: Date;
};

/** A bar of the chart: the average steps a day of its day, week or month. */
type Bar = { start: string; steps: number };

/**
 * The range's bars, one a span (SPAN_OF), from its first day to today, each the average of its days
 * counted. Today, still being counted, is left out of its span while another day of it counts.
 */
export function stepBars(span: Span, start: Date, today: Date, days: readonly StepDay[]): Bar[] {
  const byDay = new Map(days.map(({ day, steps }) => [day, steps]));
  const todayOn = toIsoDate(today);
  const spans = new Map<string, { sum: number; count: number; today?: number }>();
  for (let date = start; date <= today; date = addDays(date, 1)) {
    const day = toIsoDate(date);
    const totals = spans.get(spanStart(day, span)) ?? { sum: 0, count: 0 };
    const steps = byDay.get(day);
    if (day === todayOn) {
      totals.today = steps;
    } else if (steps !== undefined) {
      totals.sum += steps;
      totals.count += 1;
    }
    spans.set(spanStart(day, span), totals);
  }
  return [...spans].map(([spanFirst, { sum, count, today: todaySteps }]) => ({
    start: spanFirst,
    steps: count > 0 ? sum / count : (todaySteps ?? 0),
  }));
}

/**
 * X * the days, or of the weeks over longer ranges, with the range to choose under it.
 */
export function StepsCard({ entering, today }: StepsCardProps) {
  const { t } = useTranslation();
  const { colors, spacing } = useTheme();
  const { format } = useNumberFormat();
  const monthDay = useMonthDayFormat();
  const [range, setRange] = useState<ProgressRange>('month');
  const start = rangeStart(range, today);
  const days = useStepDays(start, today);
  // While a new range loads, the last days keep the bars of the range they were loaded for.
  const [shownRange, setShownRange] = useState(range);
  if (days.data && !days.isPlaceholderData && shownRange !== range) {
    setShownRange(range);
  }
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
    const chart = stepBars(SPAN_OF[shownRange], rangeStart(shownRange, today), today, days.data);
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
          {chart.map(({ start: spanFirst, steps }, index) => (
            <View
              key={spanFirst}
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
