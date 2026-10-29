import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Card, type CardProps } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { TextLink } from '@/components/ui/text-link';
import { fromIsoDate, useShortDateFormat } from '@/i18n/dates';
import { useNumberFormat } from '@/i18n/units';
import { Average } from '@/nutrition/average';
import { DailyProgress } from '@/nutrition/daily-progress';
import { nutritionSummary, useDayNutrition } from '@/nutrition/day-nutrition';
import { MacroBars } from '@/nutrition/macro-bars';
import { useTheme } from '@/theme';

import { averageTarget, nutritionSpans, SPAN_OF, type NutritionSpan } from './nutrition-spans';
import { RangeControl } from './range-control';
import { rangeStart, type ProgressRange } from './ranges';

type NutritionCardProps = {
  entering?: CardProps['entering'];
  today: Date;
};

/**
 * What was eaten over a range (ADR 0047): a bar of macros for each day of a month, or each week
 * or month of longer ranges, against the average target, then the range summed up against the
 * targets of its days logged.
 */
export function NutritionCard({ entering, today }: NutritionCardProps) {
  const { t, i18n } = useTranslation();
  const { colors, spacing } = useTheme();
  const { format } = useNumberFormat();
  const shortDate = useShortDateFormat(today);
  const monthName = new Intl.DateTimeFormat(i18n.language, { month: 'short' });
  const [range, setRange] = useState<ProgressRange>('month');
  const days = useDayNutrition(today, rangeStart(range, today), today, { keepLast: true });
  const span = SPAN_OF[range];
  const summary = days.data ? nutritionSummary(days.data) : null;

  // Along the axis, a span's first day or its month; read out, a week says it is one.
  const axisNameOf = (spanStart: string) => {
    const date = fromIsoDate(spanStart);
    return span === 'month' ? monthName.format(date) : shortDate(date);
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
  if (days.isError && days.data === undefined) {
    content = (
      <View style={[styles.placeholder, { gap: spacing.sm }]}>
        <Text variant="caption" color="textMuted" align="center">
          {t('progress.eating.error')}
        </Text>
        <TextLink label={t('common.tryAgain')} onPress={() => void days.refetch()} />
      </View>
    );
  } else if (days.data === undefined) {
    content = (
      <ActivityIndicator
        style={styles.placeholder}
        color={colors.primary}
        accessibilityLabel={t('common.loading')}
      />
    );
  } else {
    const spans = nutritionSpans(days.data, span);
    const target = averageTarget(days.data) ?? undefined;
    const ends = [spans[0], spans[Math.floor((spans.length - 1) / 2)], spans[spans.length - 1]];
    content =
      summary === null ? (
        <Text variant="caption" color="textMuted">
          {t('progress.eating.none')}
        </Text>
      ) : (
        <>
          <MacroBars
            bars={spans.map((item) => ({
              key: item.start,
              eaten: item.summary?.average ?? { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 },
              logged: item.summary !== null,
              over: item.over,
              accessibilityLabel: labelOf(item),
            }))}
            target={target}
            axis={ends.map((item) => (item ? axisNameOf(item.start) : ''))}
          />
          {summary.targets ? (
            <View style={[styles.summary, { gap: spacing.md, borderTopColor: colors.border }]}>
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
            </View>
          ) : null}
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
            strong
            value={t('nutrition.kcal', { calories: format(Math.round(summary.average.calories)) })}
          />
        ) : null}
      </View>
      <RangeControl
        value={range}
        onChange={setRange}
        accessibilityLabel={t('progress.eating.rangeLabel')}
      />
      {content}
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
  placeholder: {
    height: 150,
    justifyContent: 'center',
    alignItems: 'center',
  },
  summary: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 12,
  },
});
