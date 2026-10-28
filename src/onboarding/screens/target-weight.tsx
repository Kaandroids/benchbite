import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { defaultTargetKg, minHealthyWeightKg, targetWeightProblem } from '@/body/body';
import { Button } from '@/components/ui/button';
import { IconTile } from '@/components/ui/icon-tile';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { TargetWeightNote } from '@/goals/target-weight-note';
import { useTheme } from '@/theme';
import { WeightWheels } from '@/weight/weight-wheels';

import { useStep } from '../use-step';
import { CenteredContent } from './centered-content';

/**
 * The target weight for goals that change the weight. It has to lie in the goal's direction and,
 * when losing fat, not below a healthy weight for the height; a target that is too low can be
 * replaced with the lowest healthy one in a tap.
 */
export function TargetWeightStep() {
  const { t } = useTranslation();
  const { spacing } = useTheme();
  const { answers, progress, next, back } = useStep('target-weight');
  const goal = answers.goal === 'build_muscle' ? 'build_muscle' : 'lose_fat';
  const weightKg = answers.weightKg ?? 72;
  const heightCm = answers.heightCm ?? 172;
  const unit = answers.weightUnit ?? 'kg';
  const lowestKg = minHealthyWeightKg(heightCm);
  const [targetKg, setTargetKg] = useState(
    answers.targetWeightKg ?? defaultTargetKg(goal, weightKg, heightCm),
  );

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

  const problem = targetWeightProblem(goal, weightKg, targetKg, heightCm);

  return (
    <Screen
      progress={progress}
      onBack={back}
      footer={
        <Button
          label={t('common.continue')}
          disabled={problem !== null}
          onPress={() => next({ targetWeightKg: targetKg })}
        />
      }
    >
      <Text variant="title">{t('onboarding.steps.target-weight.title')}</Text>
      <CenteredContent
        below={
          <TargetWeightNote
            goal={goal}
            weightKg={weightKg}
            targetKg={targetKg}
            heightCm={heightCm}
            unit={unit}
            problem={problem}
            onUseLowest={setTargetKg}
          />
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
