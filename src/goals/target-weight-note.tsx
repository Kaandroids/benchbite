import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { minHealthyWeightKg, type TargetWeightProblem, type WeightGoal } from '@/body/body';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { useWeightFormat, type WeightUnit } from '@/i18n/units';
import { useTheme } from '@/theme';

type TargetWeightNoteProps = {
  goal: WeightGoal;
  weightKg: number;
  targetKg: number;
  heightCm: number;
  unit: WeightUnit;
  problem: TargetWeightProblem | null;
  /** Makes the lowest healthy weight the target. */
  onUseLowest: (kg: number) => void;
};

/**
 * What is wrong with a target weight, with a tap to the lowest healthy one when it is too low, or
 * how far it is from the current weight.
 */
export function TargetWeightNote({
  goal,
  weightKg,
  targetKg,
  heightCm,
  unit,
  problem,
  onUseLowest,
}: TargetWeightNoteProps) {
  const { t } = useTranslation();
  const { spacing } = useTheme();
  const formatWeight = useWeightFormat();
  const show = (kg: number) => formatWeight(kg, unit);
  const lowestKg = minHealthyWeightKg(heightCm);

  if (problem === 'wrongDirection' || problem === 'tooClose') {
    return (
      <Text color="danger" align="center">
        {problem === 'tooClose'
          ? t('onboarding.targetWeight.tooClose')
          : t(`onboarding.targetWeight.wrongDirection.${goal}`)}
      </Text>
    );
  }
  if (problem === 'belowHealthy') {
    return (
      <View style={{ gap: spacing.sm }}>
        <Text color="danger" align="center">
          {t('onboarding.targetWeight.belowHealthy', { weight: show(lowestKg), unit })}
        </Text>
        <Button
          variant="secondary"
          label={t('onboarding.targetWeight.useLowest', { weight: show(lowestKg), unit })}
          onPress={() => onUseLowest(lowestKg)}
        />
      </View>
    );
  }
  const differenceKg = targetKg - weightKg;
  const sign = differenceKg > 0 ? '+' : differenceKg < 0 ? '−' : '';
  return (
    <Text variant="bodyStrong" color="primaryText" align="center">
      {t('onboarding.targetWeight.difference', {
        difference: `${sign}${show(Math.abs(differenceKg))}`,
        unit,
      })}
    </Text>
  );
}
