import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { type IconName } from '@/components/ui/icon';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { GoalChoices } from '@/goals/goal-choices';
import type { ColorTokens } from '@/theme';

import { ChoiceInsight, InsightRow } from '../choice-insight';
import { useStep } from '../use-step';

/** What a goal sets in the plan, one row each, in the colours of the app's lists. */
const EFFECTS: {
  key: 'calories' | 'training' | 'progress';
  icon: IconName;
  iconColors: { color: keyof ColorTokens; background: keyof ColorTokens };
}[] = [
  { key: 'calories', icon: 'flame', iconColors: { color: 'lunch', background: 'lunchBackground' } },
  {
    key: 'training',
    icon: 'dumbbell',
    iconColors: { color: 'dinner', background: 'dinnerBackground' },
  },
  { key: 'progress', icon: 'trend', iconColors: { color: 'water', background: 'waterBackground' } },
];

/**
 * The main goal, which decides both the training scheme and the calorie direction. Choosing one
 * shows what it sets in the plan, and Continue moves on, so the choice can be compared first.
 */
export function GoalStep() {
  const { t } = useTranslation();
  const { answers, select, next, bar } = useStep('goal');
  const goal = answers.goal;

  return (
    <Screen
      {...bar}
      footer={<Button label={t('common.continue')} disabled={!goal} onPress={() => next()} />}
    >
      <Text variant="title" accessibilityRole="header">
        {t('onboarding.steps.goal.title')}
      </Text>
      <GoalChoices value={goal} onChange={(option) => select({ goal: option })} />
      <ChoiceInsight
        title={t('onboarding.goal.effects.title')}
        choice={goal}
        empty={<Text color="textMuted">{t('onboarding.goal.effects.empty')}</Text>}
      >
        {goal
          ? EFFECTS.map(({ key, icon, iconColors }) => (
              <InsightRow
                key={key}
                icon={icon}
                iconColors={iconColors}
                label={t(`onboarding.goal.effects.${key}`)}
                value={t(`onboarding.goal.effects.${goal}.${key}`)}
              />
            ))
          : null}
      </ChoiceInsight>
    </Screen>
  );
}
