import { useTranslation } from 'react-i18next';

import { Card, type CardProps } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { DailyProgress } from '@/nutrition/daily-progress';
import type { NutritionTargets } from '@/nutrition/targets';
import type { WeekNutrition } from '@/nutrition/week-nutrition';

type WeekSummaryCardProps = {
  entering?: CardProps['entering'];
  week: WeekNutrition;
  /** The targets of the days logged, which the week has. */
  targets: NutritionTargets;
};

/**
 * A past week summed up as the daily targets are (ADR 0046): the calories and macros eaten against
 * the targets of the days logged, with each macro's average a day under it.
 */
export function WeekSummaryCard({ entering, week, targets }: WeekSummaryCardProps) {
  const { t } = useTranslation();
  return (
    <Card entering={entering}>
      <Text variant="headline" accessibilityRole="header">
        {t('today.pastWeek.summary.title')}
      </Text>
      <DailyProgress targets={targets} eaten={week.eaten} average={week.average} />
    </Card>
  );
}
