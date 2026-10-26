import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { ChoiceCard } from '@/components/ui/choice-card';
import { type IconName } from '@/components/ui/icon';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { Constants } from '@/lib/database.types';

import { ChoiceInsight, InsightRow } from '../choice-insight';
import { GOAL_ICONS } from '../goal-icons';
import { useStep } from '../use-step';

/** What a goal sets in the plan, one row each. */
const EFFECTS: { key: 'calories' | 'training' | 'progress'; icon: IconName }[] = [
  { key: 'calories', icon: 'flame' },
  { key: 'training', icon: 'dumbbell' },
  { key: 'progress', icon: 'trend' },
];

/**
 * The main goal, which decides both the training scheme and the calorie direction. Choosing one
 * shows what it sets in the plan, and Continue moves on, so the choice can be compared first.
 */
export function GoalStep() {
  const { t } = useTranslation();
  const { answers, progress, back, select, next } = useStep('goal');
  const goal = answers.goal;

  return (
    <Screen
      progress={progress}
      onBack={back}
      footer={<Button label={t('common.continue')} disabled={!goal} onPress={() => next()} />}
    >
      <Text variant="title" accessibilityRole="header">
        {t('onboarding.steps.goal.title')}
      </Text>
      {Constants.public.Enums.goal_kind.map((option) => (
        <ChoiceCard
          key={option}
          icon={GOAL_ICONS[option]}
          title={t(`onboarding.options.goal.${option}`)}
          description={t(`onboarding.goal.descriptions.${option}`)}
          selected={goal === option}
          onPress={() => select({ goal: option })}
          size="compact"
        />
      ))}
      <ChoiceInsight
        title={t('onboarding.goal.effects.title')}
        choice={goal}
        empty={<Text color="textMuted">{t('onboarding.goal.effects.empty')}</Text>}
      >
        {goal
          ? EFFECTS.map(({ key, icon }) => (
              <InsightRow
                key={key}
                icon={icon}
                label={t(`onboarding.goal.effects.${key}`)}
                value={t(`onboarding.goal.effects.${goal}.${key}`)}
              />
            ))
          : null}
      </ChoiceInsight>
    </Screen>
  );
}
