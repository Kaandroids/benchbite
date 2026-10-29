import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import Svg, { Rect } from 'react-native-svg';

import { RangeControl } from '@/components/range-control';
import { Card, type CardProps } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { TextLink } from '@/components/ui/text-link';
import { addDays } from '@/i18n/dates';
import { useNumberFormat } from '@/i18n/units';
import { rangeStart, type ProgressRange } from '@/lib/ranges';
import { useTheme } from '@/theme';
import { trainingSummary, useDayTraining } from '@/workouts/day-training';

import { HEAT_COLORS, HeatMap } from './heat-map';

type TrainingCardProps = {
  entering?: CardProps['entering'];
  today: Date;
};

/**
 * How training went over a range (ADR 0047): a heat map of the days by the minutes trained, with
 * the planned workouts missed, then how much of the plan was done, the time trained and the weight
 * lifted against the range before.
 */
export function TrainingCard({ entering, today }: TrainingCardProps) {
  const { t } = useTranslation();
  const { colors, spacing } = useTheme();
  const { format } = useNumberFormat();
  const [range, setRange] = useState<ProgressRange>('threeMonths');
  const start = rangeStart(range, today);
  const days = useDayTraining(today, start, today, { keepLast: true });
  const before = addDays(start, -1);
  const last = useDayTraining(today, rangeStart(range, before), before, { keepLast: true });
  const summary = days.data ? trainingSummary(days.data) : null;
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
  if (days.isError && days.data === undefined) {
    content = (
      <View style={[styles.placeholder, { gap: spacing.sm }]}>
        <Text variant="caption" color="textMuted" align="center">
          {t('progress.training.error')}
        </Text>
        <TextLink label={t('common.tryAgain')} onPress={() => void days.refetch()} />
      </View>
    );
  } else if (days.data === undefined || summary === null) {
    content = (
      <ActivityIndicator
        style={styles.placeholder}
        color={colors.primary}
        accessibilityLabel={t('common.loading')}
      />
    );
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
        <HeatMap
          days={days.data}
          today={today}
          accessibilityLabel={t('progress.training.map', {
            count: summary.days,
            missed: summary.planned - summary.done,
          })}
        />
        <View
          style={[styles.legend, { gap: spacing.xs }]}
          importantForAccessibility="no-hide-descendants"
          accessibilityElementsHidden
        >
          <Text variant="caption" color="textMuted">
            {t('progress.training.less')}
          </Text>
          {HEAT_COLORS.map((color) => (
            <View key={color} style={[styles.swatch, { backgroundColor: colors[color] }]} />
          ))}
          <Text variant="caption" color="textMuted">
            {t('progress.training.more')}
          </Text>
          <View style={styles.flex} />
          <Svg width={12} height={12}>
            <Rect
              x={0.75}
              y={0.75}
              width={10.5}
              height={10.5}
              rx={3}
              fill="none"
              stroke={colors.danger}
              strokeWidth={1.5}
              strokeDasharray="3 2"
            />
          </Svg>
          <Text variant="caption" color="textMuted">
            {t('progress.training.missed')}
          </Text>
        </View>
        <View style={[styles.stats, { gap: spacing.md, borderTopColor: colors.border }]}>
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
      <RangeControl
        value={range}
        onChange={setRange}
        accessibilityLabel={t('progress.training.rangeLabel')}
      />
      {content}
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
      <Text variant="title">{value}</Text>
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
  placeholder: {
    height: 150,
    justifyContent: 'center',
    alignItems: 'center',
  },
  legend: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  swatch: {
    width: 12,
    height: 12,
    borderRadius: 3,
  },
  stats: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 12,
  },
});
