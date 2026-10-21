import { useTranslation } from 'react-i18next';

import { ChoiceCard } from '@/components/ui/choice-card';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { Constants } from '@/lib/database.types';

import { GOAL_ICONS } from '../goal-icons';
import { useStep } from '../use-step';

/** The main goal, which decides both the training scheme and the calorie direction. */
export function GoalStep() {
  const { t } = useTranslation();
  const { answers, progress, back, choose } = useStep('goal');

  return (
    <Screen progress={progress} onBack={back}>
      <Text variant="title">{t('onboarding.steps.goal.title')}</Text>
      {Constants.public.Enums.goal_kind.map((goal) => (
        <ChoiceCard
          key={goal}
          icon={GOAL_ICONS[goal]}
          title={t(`onboarding.options.goal.${goal}`)}
          description={t(`onboarding.goal.descriptions.${goal}`)}
          selected={answers.goal === goal}
          onPress={() => choose({ goal })}
        />
      ))}
    </Screen>
  );
}
