import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { RangeControl } from '@/components/range-control';
import { Card, type CardProps } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { fromIsoDate, useMonthFormat, useShortDateFormat } from '@/i18n/dates';
import { useNumberFormat } from '@/i18n/units';
import { rangeStart, type ProgressRange } from '@/lib/ranges';
import { Average } from '@/nutrition/average';
import { DailyProgress } from '@/nutrition/daily-progress';
import { nutritionSummary, useDayNutrition } from '@/nutrition/day-nutrition';
import { MacroBars } from '@/nutrition/macro-bars';
import { NOTHING } from '@/nutrition/meals';
import { useTheme } from '@/theme';

import { CardLoadState } from './card-load-state';
import { nutritionSpans, SPAN_OF, type NutritionSpan } from './nutrition-spans';
import { SummaryBox } from './summary-box';

type NutritionCardProps = {
  entering?: CardProps['entering'];
  today: Date;
};

/**
 * What was eaten over a range (ADR 0047): the range summed up against the targets of its days
 * logged, then a bar of macros for each day of a month, or each week or month of longer ranges,
 * against the average target, with the range to choose under it (#335).
 */
export function NutritionCard({ entering, today }: NutritionCardProps) {
  const { t } = useTranslation();
  const { spacing } = useTheme();
  const { format } = useNumberFormat();
  const shortDate = useShortDateFormat(today);
  const monthName = useMonthFormat();
  const [range, setRange] = useState<ProgressRange>('month');
  const days = useDayNutrition(today, rangeStart(range, today), today, { keepLast: true });
  // While a new range loads, the last days keep the bars of the range they were loaded for.
  const [shownRange, setShownRange] = useState(range);
  if (days.data && !days.isPlaceholderData && shownRange !== range) {
    setShownRange(range);
  }
  const span = SPAN_OF[shownRange];
  const summary = days.data ? nutritionSummary(days.data) : null;

  // Along the axis, a span's first day or its month; read out, a week says it is one.
  const axisNameOf = (spanStart: string) => {
    const date = fromIsoDate(spanStart);
    return span === 'month' ? monthName(date) : shortDate(date);
  };
  const nameOf = (spanStart: string) =>
    span === 'week'
      ? t('progress.eating.weekOf', { date: axisNameOf(spanStart) })
      : axisNameOf(spanStart);
  const labelOf = ({ start, summary, over }: NutritionSpan) =>
    summary === null
      ? t('progress.eating.notLogged', { span: nameOf(start) })
      : [
          t('progress.eating.bar', {
            span: nameOf(start),
            kcal: format(Math.round(summary.average.calories)),
            protein: format(Math.round(summary.average.proteinG)),
            carbs: format(Math.round(summary.average.carbsG)),
            fat: format(Math.round(summary.average.fatG)),
          }),
          ...(over ? [t('progress.eating.overTarget')] : []),
        ].join(', ');

  let content;
  if (days.data === undefined) {
    content = <CardLoadState query={days} error={t('progress.eating.error')} />;
  } else {
    const spans = nutritionSpans(days.data, span);
    const ends = [spans[0], spans[Math.floor((spans.length - 1) / 2)], spans[spans.length - 1]];
    content =
      summary === null ? (
        <Text variant="caption" color="textMuted">
          {t('progress.eating.none')}
        </Text>
      ) : (
        <>
          {summary.targets ? (
            <SummaryBox>
              <View style={[styles.summaryTitle, { gap: spacing.sm }]}>
                <Text variant="label" accessibilityRole="header" style={styles.flex}>
                  {t('progress.summary.title')}
                </Text>
                <Text variant="caption" color="textMuted">
                  {t(`progress.summary.${shownRange}`)}
                </Text>
              </View>
              <Text variant="caption" color="textMuted">
                {t('progress.eating.logged', {
                  count: summary.days,
                  within: summary.withinTarget,
                })}
              </Text>
              <DailyProgress
                targets={summary.targets}
                eaten={summary.eaten}
                average={summary.average}
              />
            </SummaryBox>
          ) : null}
          <MacroBars
            bars={spans.map((item) => ({
              key: item.start,
              eaten: item.summary?.average ?? NOTHING,
              logged: item.summary !== null,
              over: item.over,
              accessibilityLabel: labelOf(item),
            }))}
            target={summary.averageTargets?.calories}
            axis={ends.map((item) => (item ? axisNameOf(item.start) : ''))}
          />
        </>
      );
  }

  return (
    <Card entering={entering}>
      <View style={styles.header}>
        <Text variant="headline" accessibilityRole="header" style={styles.flex}>
          {t('progress.eating.title')}
        </Text>
        {summary ? (
          <Average
            value={t('nutrition.kcal', { calories: format(Math.round(summary.average.calories)) })}
          />
        ) : null}
      </View>
      {content}
      <RangeControl
        value={range}
        onChange={setRange}
        accessibilityLabel={t('progress.eating.rangeLabel')}
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  flex: {
    flex: 1,
  },
  summaryTitle: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
});
