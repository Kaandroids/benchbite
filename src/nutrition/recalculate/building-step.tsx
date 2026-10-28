import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { weightGoal } from '@/body/body';
import { Building } from '@/components/building';
import { Button } from '@/components/ui/button';
import { Screen } from '@/components/ui/screen';
import { paceIn, useNumberFormat, useWeightLabel, type WeightUnit } from '@/i18n/units';

import { useRecalculateTargets, type TargetAnswers } from '../targets';
import { type StepProps } from './step';

type BuildingStepProps = Pick<StepProps, 'answers' | 'weightKg' | 'unit'> & {
  /** The targets in use before, handed on to the page with the new ones. */
  was: string | undefined;
};

/**
 * Saves the new answers while the onboarding's plate fills up and lines about the goals show one
 * after another. Once saved, See my goals opens the new goals. Leaving waits until the save is
 * over, so that it is not left half seen; a failure offers to try again or go back.
 */
export function BuildingStep({ answers, weightKg, unit, was }: BuildingStepProps) {
  const { t } = useTranslation();
  const recalculate = useRecalculateTargets();
  const lines = useGoalLines(answers, weightKg, unit);
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);
  const [saved, setSaved] = useState(false);
  const working = !failed && !saved;

  const see = () => {
    // The steps close under the page with the new goals, so going back from it leaves.
    router.dismissTo('/nutrition/goals');
    router.push({ pathname: '/nutrition/recalculate/[step]', params: { step: 'done', was } });
  };

  return (
    <Screen
      onBack={failed ? () => router.back() : undefined}
      footer={
        failed ? (
          <Button
            label={t('common.tryAgain')}
            onPress={() => {
              setFailed(false);
              setAttempt((count) => count + 1);
            }}
          />
        ) : saved ? (
          <Animated.View entering={FadeInDown.duration(400)}>
            <Button label={t('nutrition.recalculate.building.see')} onPress={see} />
          </Animated.View>
        ) : undefined
      }
    >
      <Stack.Screen options={{ gestureEnabled: !working }} />
      {/* A new key starts a fresh attempt. */}
      <Building
        key={attempt}
        title={t('nutrition.recalculate.building.title')}
        intro={t('nutrition.recalculate.building.wait')}
        lines={lines}
        ready={t('nutrition.recalculate.building.ready')}
        error={t('nutrition.recalculate.building.error')}
        work={() => recalculate.mutateAsync(answers)}
        failed={failed}
        onDone={() => setSaved(true)}
        onFail={() => setFailed(true)}
      />
    </Screen>
  );
}

/** The lines about the goals, from the answers: the goal, the weight and pace, the activity. */
function useGoalLines(answers: TargetAnswers, weightKg: number, unit: WeightUnit): string[] {
  const { t } = useTranslation();
  const { format } = useNumberFormat();
  const weightLabel = useWeightLabel();
  const weight = weightLabel(weightKg, unit);
  const aim = weightGoal({
    goal: answers.goal,
    targetWeightKg: answers.targetWeightKg ?? undefined,
    weeklyPaceKg: answers.weeklyPaceKg ?? undefined,
  });
  return [
    t('nutrition.recalculate.building.lines.goal', { goal: t(`goals.goal.${answers.goal}`) }),
    aim
      ? t(
          `nutrition.recalculate.building.lines.${aim.goal === 'lose_fat' ? 'losing' : 'gaining'}`,
          {
            pace: `${format(paceIn(unit, aim.paceKg))} ${unit}`,
            weight,
          },
        )
      : t('nutrition.recalculate.building.lines.keeping', { weight }),
    t('nutrition.recalculate.building.lines.activity', {
      level: t(`goals.activityLevel.${answers.activity}`),
    }),
    t('nutrition.recalculate.building.lines.calories'),
  ];
}
