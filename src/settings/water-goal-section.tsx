import { useTranslation } from 'react-i18next';

import { SegmentedControl } from '@/components/ui/segmented-control';
import { Text } from '@/components/ui/text';
import { useLitersFormat } from '@/i18n/units';
import { GLASS_ML } from '@/nutrition/water';
import { useSetWaterGoal, useWaterGoal, WATER_GOALS_ML } from '@/profile/water-goal';

/** The daily water goal, from a few common amounts. */
export function WaterGoalSection() {
  const { t } = useTranslation();
  const liters = useLitersFormat();
  const goal = useWaterGoal();
  const setGoal = useSetWaterGoal();
  if (goal.data === undefined) {
    return null;
  }
  return (
    <>
      <SegmentedControl
        accessibilityLabel={t('settings.waterGoal')}
        options={WATER_GOALS_ML.map((ml) => ({
          value: String(ml),
          label: t('settings.liters', { amount: liters(ml) }),
        }))}
        value={String(goal.data)}
        onChange={(value) => setGoal.mutate(Number(value))}
      />
      <Text variant="caption" color="textMuted">
        {t('settings.waterGoalNote', { ml: GLASS_ML })}
      </Text>
    </>
  );
}
