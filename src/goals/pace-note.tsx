import { useTranslation } from 'react-i18next';

import { PACE_LEVELS } from '@shared/body/limits';

import {
  PACE_RANGES,
  paceLevel,
  paceRange,
  projectedDate,
  type PaceLevel,
  type WeightGoal,
} from '@/body/body';
import { Text } from '@/components/ui/text';
import { useDateFormat } from '@/i18n/dates';
import { paceIn, useNumberFormat, useWeightFormat, type WeightUnit } from '@/i18n/units';
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
  const { format } = useNumberFormat();
  const formatDate = useDateFormat('long');
  const level = paceLevel(goal, weightKg, paceKg);
  const range = paceRange(unit, goal, weightKg);
  const fastest = paceIn(unit, paceKg) >= range.max;
  // At the fastest pace for a light user's weight, rather than at the fastest the targets allow.
  const forWeight = range.max < PACE_RANGES[unit][goal].max;
  return (
    <>
      <Text variant="bodyStrong" color={LEVEL_COLORS[level]} align={align}>
        {t(`goals.pace.levels.${level}`)}
      </Text>
      {fastest ? (
        <Text color="textMuted" align={align}>
          {forWeight
            ? t('goals.pace.fastestForWeight', { percent: format(PACE_LEVELS.losing[1]) })
            : t(`goals.pace.fastest.${goal}`)}
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
