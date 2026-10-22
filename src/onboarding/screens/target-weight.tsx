import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { IconTile } from '@/components/ui/icon-tile';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { useWeightFormat } from '@/i18n/units';
import { useTheme } from '@/theme';

import { isTargetInGoalDirection, minHealthyWeightKg } from '../body';
import { useStep } from '../use-step';
import { CenteredContent } from './centered-content';
import { WeightWheels } from './weight-wheels';

/** How far from the current weight the wheel starts. */
const DEFAULT_CHANGE_KG = { lose_fat: -5, build_muscle: 3 };

/**
 * The target weight for goals that change the weight. It has to lie in the goal's direction and,
 * when losing fat, not below a healthy weight for the height; a target that is too low can be
 * replaced with the lowest healthy one in a tap.
 */
export function TargetWeightStep() {
  const { t } = useTranslation();
  const { spacing } = useTheme();
  const formatWeight = useWeightFormat();
  const { answers, progress, next, back } = useStep('target-weight');
  const goal = answers.goal === 'build_muscle' ? 'build_muscle' : 'lose_fat';
  const weightKg = answers.weightKg ?? 72;
  const heightCm = answers.heightCm ?? 172;
  const unit = answers.weightUnit ?? 'kg';
  const lowestKg = minHealthyWeightKg(heightCm);
  const [targetKg, setTargetKg] = useState(
    answers.targetWeightKg ?? Math.max(lowestKg, weightKg + DEFAULT_CHANGE_KG[goal]),
  );

  const show = (kg: number) => formatWeight(kg, unit);

  // Someone already at the lower end of a healthy weight should not lose more.
  if (goal === 'lose_fat' && weightKg <= lowestKg) {
    return (
      <Screen
        progress={progress}
        onBack={back}
        footer={
          <Button
            label={t('onboarding.targetWeight.changeGoal')}
            onPress={() =>
              router.dismissTo({ pathname: '/onboarding/[step]', params: { step: 'goal' } })
            }
          />
        }
      >
        <View style={[styles.centeredContent, { gap: spacing.lg }]}>
          <IconTile name="heart" size={88} />
          <Text color="textMuted" align="center">
            {t('onboarding.targetWeight.alreadyLow')}
          </Text>
        </View>
      </Screen>
    );
  }

  const wrongDirection = !isTargetInGoalDirection(goal, weightKg, targetKg);
  const belowHealthy = goal === 'lose_fat' && targetKg < lowestKg;
  const differenceKg = targetKg - weightKg;
  const sign = differenceKg > 0 ? '+' : differenceKg < 0 ? '−' : '';

  return (
    <Screen
      progress={progress}
      onBack={back}
      footer={
        <Button
          label={t('common.continue')}
          disabled={wrongDirection || belowHealthy}
          onPress={() => next({ targetWeightKg: targetKg })}
        />
      }
    >
      <Text variant="title">{t('onboarding.steps.target-weight.title')}</Text>
      <CenteredContent
        below={
          <>
            {wrongDirection ? (
              <Text color="danger" align="center">
                {t(`onboarding.targetWeight.wrongDirection.${goal}`)}
              </Text>
            ) : belowHealthy ? (
              <View style={{ gap: spacing.sm }}>
                <Text color="danger" align="center">
                  {t('onboarding.targetWeight.belowHealthy', { weight: show(lowestKg), unit })}
                </Text>
                <Button
                  variant="secondary"
                  label={t('onboarding.targetWeight.useLowest', { weight: show(lowestKg), unit })}
                  onPress={() => setTargetKg(lowestKg)}
                />
              </View>
            ) : (
              <Text variant="bodyStrong" color="primaryText" align="center">
                {t('onboarding.targetWeight.difference', {
                  difference: `${sign}${show(Math.abs(differenceKg))}`,
                  unit,
                })}
              </Text>
            )}
          </>
        }
      >
        <WeightWheels
          kg={targetKg}
          unit={unit}
          onChange={setTargetKg}
          accessibilityLabel={t('onboarding.steps.target-weight.title')}
        />
      </CenteredContent>
    </Screen>
  );
}

const styles = StyleSheet.create({
  centeredContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
