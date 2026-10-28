import { useTranslation } from 'react-i18next';

import {
  PACE_RANGES,
  paceLevel,
  projectedDate,
  type PaceLevel,
  type WeightGoal,
} from '@/body/body';
import { Text } from '@/components/ui/text';
import { useDateFormat } from '@/i18n/dates';
import { paceIn, useWeightFormat, type WeightUnit } from '@/i18n/units';
import type { ColorTokens } from '@/theme';

const LEVEL_COLORS: Record<PaceLevel, keyof ColorTokens> = {
  ideal: 'success',
  ambitious: 'warning',
  aggressive: 'danger',
};

type PaceNoteProps = {
  goal: WeightGoal;
  weightKg: number;
  targetKg: number;
  paceKg: number;
  unit: WeightUnit;
  align?: 'center' | 'left';
};

/** How demanding a weekly pace is, and when it reaches the target. */
export function PaceNote({
  goal,
  weightKg,
  targetKg,
  paceKg,
  unit,
  align = 'center',
}: PaceNoteProps) {
  const { t } = useTranslation();
  const formatWeight = useWeightFormat();
  const formatDate = useDateFormat('long');
  const level = paceLevel(goal, weightKg, paceKg);
  const fastest = paceIn(unit, paceKg) >= PACE_RANGES[unit][goal].max;
  return (
    <>
      <Text variant="bodyStrong" color={LEVEL_COLORS[level]} align={align}>
        {t(`goals.pace.levels.${level}`)}
      </Text>
      {fastest ? (
        <Text color="textMuted" align={align}>
          {t(`goals.pace.fastest.${goal}`)}
        </Text>
      ) : null}
      <Text align={align}>
        {t('goals.pace.projected', {
          weight: formatWeight(targetKg, unit),
          unit,
          date: formatDate(projectedDate(weightKg, targetKg, paceKg, new Date())),
        })}
      </Text>
    </>
  );
}
