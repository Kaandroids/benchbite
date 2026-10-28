import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { defaultTargetKg, isTooLightToLose, targetWeightProblem } from '@/body/body';
import { Button } from '@/components/ui/button';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { TargetWeightNote } from '@/goals/target-weight-note';
import { TooLightToLose } from '@/goals/too-light-to-lose';
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
  const { answers, progress, next, back, close } = useStep('target-weight');
  const goal = answers.goal === 'build_muscle' ? 'build_muscle' : 'lose_fat';
  const weightKg = answers.weightKg ?? 72;
  const heightCm = answers.heightCm ?? 172;
  const unit = answers.weightUnit ?? 'kg';
  const [targetKg, setTargetKg] = useState(
    answers.targetWeightKg ?? defaultTargetKg(goal, weightKg, heightCm),
  );

  // Someone already at the lower end of a healthy weight should not lose more.
  if (goal === 'lose_fat' && isTooLightToLose(weightKg, heightCm)) {
    return (
      <Screen
        progress={progress}
        onBack={back}
        onClose={close}
        footer={
          <Button
            label={t('goals.targetWeight.changeGoal')}
            onPress={() =>
              router.dismissTo({ pathname: '/onboarding/[step]', params: { step: 'goal' } })
            }
          />
        }
      >
        <TooLightToLose />
      </Screen>
    );
  }

  const problem = targetWeightProblem(goal, weightKg, targetKg, heightCm);

  return (
    <Screen
      progress={progress}
      onBack={back}
      onClose={close}
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
