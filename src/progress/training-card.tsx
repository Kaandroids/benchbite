import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { RangeControl } from '@/components/range-control';
import { Caption } from '@/components/ui/caption';
import { Card, type CardProps } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { trainingSummary, useDayTraining } from '@/history/day-training';
import { addDays } from '@/i18n/dates';
import { useNumberFormat } from '@/i18n/units';
import { rangeStart, type ProgressRange } from '@/lib/ranges';
import { useTheme } from '@/theme';

import { CardLoadState } from './card-load-state';
import { HeatMap, HeatMapLegend } from './heat-map';
import { SummaryBox } from './summary-box';

/** A month is too short to show how training went; the map fills its width from three. */
const TRAINING_RANGES: readonly ProgressRange[] = ['threeMonths', 'sixMonths', 'year'];

type TrainingCardProps = {
  entering?: CardProps['entering'];
  today: Date;
};

/**
 * How training went over a range (ADR 0047): how much of the plan was done, the time trained and
 * the weight lifted against the range before, then a heat map of the days by the minutes trained,
 * with the planned workouts missed, and the range to choose under it (#335).
 */
export function TrainingCard({ entering, today }: TrainingCardProps) {
  const { t } = useTranslation();
  const { spacing } = useTheme();
  const { format } = useNumberFormat();
  const [range, setRange] = useState<ProgressRange>('threeMonths');
  const start = rangeStart(range, today);
  const days = useDayTraining(today, start, today);
  const before = addDays(start, -1);
  const last = useDayTraining(today, rangeStart(range, before), before);
  const summary = days.data ? trainingSummary(days.data) : null;
  // While a new range loads, the last days keep the name of the range they were loaded for.
  const [shownRange, setShownRange] = useState(range);
  if (days.data && !days.isPlaceholderData && shownRange !== range) {
    setShownRange(range);
  }
  const lastLifted =
    last.data && !last.isPlaceholderData && !days.isPlaceholderData
      ? trainingSummary(last.data).liftedKg
      : 0;

  const duration = (minutes: number) =>
    minutes < 60
      ? t('progress.training.minutes', { minutes: format(minutes) })
      : t('progress.training.hours', {
          hours: format(minutes / 60, { maximumFractionDigits: minutes < 600 ? 1 : 0 }),
        });
  const weight = (kg: number) =>
    kg < 1000
      ? t('progress.training.kilograms', { kilograms: format(Math.round(kg)) })
      : t('progress.training.tonnes', {
          tonnes: format(kg / 1000, { maximumFractionDigits: kg < 100_000 ? 1 : 0 }),
        });

  let content;
  if (days.data === undefined || summary === null) {
    content = <CardLoadState query={days} error={t('progress.training.error')} />;
  } else if (summary.days === 0 && summary.planned === 0) {
    content = (
      <Text variant="caption" color="textMuted">
        {t('progress.training.none')}
      </Text>
    );
  } else {
    const change =
      lastLifted > 0 && summary.liftedKg > 0
        ? Math.round((summary.liftedKg / lastLifted - 1) * 100)
        : null;
    content = (
      <>
        <SummaryBox>
          {/* A caption, unlike the eating card's titled summary, as the approved design has it. */}
          <Caption>
            {t('progress.summary.caption', { range: t(`progress.summary.${shownRange}`) })}
          </Caption>
          <View style={[styles.stats, { gap: spacing.md }]}>
            <Stat
              value={
                summary.planned > 0
                  ? format(summary.done / summary.planned, { style: 'percent' })
                  : '–'
              }
              label={t('progress.training.planDone')}
            />
            <Stat value={duration(summary.minutes)} label={t('progress.training.trained')} />
            <Stat
              value={weight(summary.liftedKg)}
              label={t('progress.training.lifted')}
              change={
                change === null
                  ? undefined
                  : `${change > 0 ? '+' : ''}${format(change / 100, { style: 'percent' })}`
              }
              better={change !== null && change >= 0}
            />
          </View>
        </SummaryBox>
        <HeatMap
          days={days.data}
          today={today}
          accessibilityLabel={t('progress.training.map', {
            count: summary.days,
            missed: summary.planned - summary.done,
          })}
        />
        <HeatMapLegend />
      </>
    );
  }

  return (
    <Card entering={entering}>
      <View style={styles.header}>
        <Text variant="headline" accessibilityRole="header" style={styles.flex}>
          {t('progress.training.title')}
        </Text>
        {summary && summary.planned > 0 ? (
          <Text variant="caption" color="textMuted">
            {t('progress.training.workouts', {
              done: format(summary.done),
              planned: format(summary.planned),
            })}
          </Text>
        ) : null}
      </View>
      {content}
      <RangeControl
        value={range}
        onChange={setRange}
        accessibilityLabel={t('progress.training.rangeLabel')}
        ranges={TRAINING_RANGES}
      />
    </Card>
  );
}

type StatProps = {
  value: string;
  label: string;
  /** Against the range before, green when it went up. */
  change?: string;
  better?: boolean;
};

function Stat({ value, label, change, better }: StatProps) {
  return (
    <View style={styles.flex}>
      <Text variant="headline">{value}</Text>
      <Text variant="caption" color="textMuted">
        {label}
        {change ? (
          <>
            {' · '}
            <Text variant="caption" color={better ? 'success' : 'danger'}>
              {change}
            </Text>
          </>
        ) : null}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  flex: {
    flex: 1,
  },
  stats: {
    flexDirection: 'row',
  },
});
