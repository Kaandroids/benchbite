import { useTranslation } from 'react-i18next';

import { ChoiceCard } from '@/components/ui/choice-card';
import type { Goal } from '@/body/body';
import { Constants } from '@/lib/database.types';

import { GOAL_ICONS, GOAL_TONES } from './goal-icons';

/** The goals to choose from, one card each. */
export function GoalChoices({
  value,
  onChange,
}: {
  value: Goal | undefined;
  onChange: (goal: Goal) => void;
}) {
  const { t } = useTranslation();
  return Constants.public.Enums.goal_kind.map((option) => (
    <ChoiceCard
      key={option}
      icon={GOAL_ICONS[option]}
      tone={GOAL_TONES[option]}
      title={t(`goals.goal.${option}`)}
      description={t(`goals.goalDescriptions.${option}`)}
      selected={value === option}
      onPress={() => onChange(option)}
      size="compact"
    />
  ));
}
