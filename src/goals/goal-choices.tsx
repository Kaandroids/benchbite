import { useTranslation } from 'react-i18next';

import { ChoiceCard } from '@/components/ui/choice-card';
import { Constants, type Database } from '@/lib/database.types';

import { GOAL_ICONS } from './goal-icons';

type Goal = Database['public']['Enums']['goal_kind'];

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
      title={t(`onboarding.options.goal.${option}`)}
      description={t(`onboarding.goal.descriptions.${option}`)}
      selected={value === option}
      onPress={() => onChange(option)}
      size="compact"
    />
  ));
}
