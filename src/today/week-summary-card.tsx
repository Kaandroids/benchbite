import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Card, type CardProps } from '@/components/ui/card';
import { ProgressBar } from '@/components/ui/progress-bar';
import { Text } from '@/components/ui/text';
import { useNumberFormat } from '@/i18n/units';
import { MacroColumns, shareOf } from '@/nutrition/daily-progress';
import type { NutritionTargets } from '@/nutrition/targets';
import type { WeekNutrition } from '@/nutrition/week-nutrition';
import { useTheme } from '@/theme';

type WeekSummaryCardProps = {
  entering?: CardProps['entering'];
  week: WeekNutrition;
  /** The targets of the days logged, which the week has. */
  targets: NutritionTargets;
};

/**
 * A past week summed up (ADR 0046): the calories eaten against the targets of the days logged, in
 * one row, and protein, carbs and fat each against theirs with their average a day.
 */
export function WeekSummaryCard({ entering, week, targets }: WeekSummaryCardProps) {
  const { t } = useTranslation();
  const { spacing } = useTheme();
  const { format } = useNumberFormat();
  const { eaten } = week;
  return (
    <Card entering={entering}>
      <Text variant="headline" accessibilityRole="header">
        {t('today.pastWeek.summary.title')}
      </Text>
      <View style={[styles.calories, { gap: spacing.md }]}>
        <View style={styles.flex}>
          <ProgressBar
            size="thin"
            value={shareOf(eaten.calories, targets.calories)}
            accessibilityLabel={t('nutrition.calorieLabel')}
          />
        </View>
        <Text variant="headline" color="primaryText">
          {format(Math.round(eaten.calories))}{' '}
          <Text variant="caption" color="textMuted">
            {t('nutrition.calorieTarget', { target: format(targets.calories) })}
          </Text>
        </Text>
      </View>
      <MacroColumns targets={targets} eaten={eaten} average={week.average} />
    </Card>
  );
}

const styles = StyleSheet.create({
  calories: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  flex: {
    flex: 1,
  },
});
