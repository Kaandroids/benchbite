import { useTranslation } from 'react-i18next';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { ProgressChart } from '@/components/progress-chart';
import { Text } from '@/components/ui/text';
import { TextLink } from '@/components/ui/text-link';
import { fromIsoDate } from '@/i18n/dates';
import { useNumberFormat, weightIn, type WeightUnit } from '@/i18n/units';
import { RangeControl } from '@/progress/range-control';
import type { ProgressRange } from '@/progress/ranges';
import { useTheme } from '@/theme';

import type { WeightEntry } from './weights';

type WeightChartProps = {
  /** The weights of the range, oldest first; undefined until they load. */
  entries: WeightEntry[] | undefined;
  /** Loading them failed, with nothing loaded before. */
  failed: boolean;
  onRetry: () => void;
  unit: WeightUnit;
  /** The weight to reach in the user's unit, with its label. */
  target?: { value: number; label: string };
  range: ProgressRange;
  onRangeChange: (range: ProgressRange) => void;
};

/** The weights of a range as a line by date, with the target, and the ranges to choose from. */
export function WeightChart({
  entries,
  failed,
  onRetry,
  unit,
  target,
  range,
  onRangeChange,
}: WeightChartProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { format } = useNumberFormat();
  // The values are in the user's unit already.
  const number = (value: number) => format(value, { maximumFractionDigits: 1 });

  let chart;
  if (failed) {
    chart = (
      <View style={[styles.chart, styles.center]}>
        <Text variant="caption" color="textMuted" align="center">
          {t('weight.historyError')}
        </Text>
        <TextLink label={t('common.tryAgain')} onPress={onRetry} />
      </View>
    );
  } else if (entries === undefined) {
    chart = (
      <ActivityIndicator
        style={styles.chart}
        color={colors.primary}
        accessibilityLabel={t('common.loading')}
      />
    );
  } else if (entries.length === 0) {
    chart = (
      <Text variant="caption" color="textMuted">
        {t('weight.noneInRange')}
      </Text>
    );
  } else {
    chart = (
      <ProgressChart
        points={entries.map((entry) => ({
          date: fromIsoDate(entry.measuredOn),
          value: weightIn(unit, entry.weightKg),
        }))}
        formatValue={(value) => `${number(value)} ${unit}`}
        formatTick={number}
        scale="whole"
        byDate
        labelLast={false}
        target={target}
        description={t('weight.chart', { count: entries.length })}
      />
    );
  }

  return (
    <>
      {chart}
      <RangeControl
        value={range}
        onChange={onRangeChange}
        accessibilityLabel={t('weight.rangeLabel')}
      />
    </>
  );
}

const styles = StyleSheet.create({
  chart: {
    height: 150,
  },
  center: {
    justifyContent: 'center',
    alignItems: 'center',
  },
});
