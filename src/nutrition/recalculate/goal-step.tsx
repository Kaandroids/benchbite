import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Screen } from '@/components/ui/screen';
import { StepHeading } from '@/components/ui/step-heading';
import { GoalChoices } from '@/goals/goal-choices';

import { answersFrom } from './answers';
import { leave, type StepProps } from './step';

export function GoalStep({ answers, basis, weightKg, progress, next }: StepProps) {
  const { t } = useTranslation();
  const [goal, setGoal] = useState(answers.goal);
  return (
    <Screen
      progress={progress}
      onBack={() => router.back()}
      onClose={leave}
      footer={
        <Button
          label={t('common.continue')}
          // The saved target and pace carry over to the same goal only.
          onPress={() => next(answersFrom({ goal, activity: answers.activity }, basis, weightKg))}
        />
      }
    >
      <StepHeading
        title={t('nutrition.recalculate.goal.title')}
        intro={t('nutrition.recalculate.goal.intro')}
      />
      <GoalChoices value={goal} onChange={setGoal} />
    </Screen>
  );
}
