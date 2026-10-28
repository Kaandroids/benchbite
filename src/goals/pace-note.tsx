import { useTranslation } from 'react-i18next';

import { paceLevel, projectedDate, type PaceLevel } from '@/body/body';
import { Text } from '@/components/ui/text';
import { useDateFormat } from '@/i18n/dates';
import { useWeightFormat, type WeightUnit } from '@/i18n/units';
import type { ColorTokens } from '@/theme';

const LEVEL_COLORS: Record<PaceLevel, keyof ColorTokens> = {
  ideal: 'success',
  ambitious: 'warning',
  aggressive: 'danger',
};

type PaceNoteProps = {
  goal: 'lose_fat' | 'build_muscle';
  weightKg: number;
  targetKg: number;
  paceKg: number;
  /** Whether the pace is the fastest one offered. */
  fastest: boolean;
  unit: WeightUnit;
  align?: 'center' | 'left';
};

/** How demanding a weekly pace is, and when it reaches the target. */
export function PaceNote({
  goal,
  weightKg,
  targetKg,
  paceKg,
  fastest,
  unit,
  align = 'center',
}: PaceNoteProps) {
  const { t } = useTranslation();
  const formatWeight = useWeightFormat();
  const formatDate = useDateFormat('long');
  const level = paceLevel(goal, weightKg, paceKg);
  return (
    <>
      <Text variant="bodyStrong" color={LEVEL_COLORS[level]} align={align}>
        {t(`onboarding.pace.levels.${level}`)}
      </Text>
      {fastest ? (
        <Text color="textMuted" align={align}>
          {t(`onboarding.pace.fastest.${goal}`)}
        </Text>
      ) : null}
      <Text align={align}>
        {t('onboarding.pace.projected', {
          weight: formatWeight(targetKg, unit),
          unit,
          date: formatDate(projectedDate(weightKg, targetKg, paceKg, new Date())),
        })}
      </Text>
    </>
  );
}
