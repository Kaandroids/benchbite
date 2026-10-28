import { useTranslation } from 'react-i18next';

import type { ActivityLevel } from '@/body/body';
import { ChoiceCard } from '@/components/ui/choice-card';
import type { IconName } from '@/components/ui/icon';
import { Constants } from '@/lib/database.types';

const ICONS: Record<ActivityLevel, IconName> = {
  sedentary: 'chair',
  light: 'person',
  moderate: 'run',
  active: 'hammer',
};
const LEVELS = Constants.public.Enums.activity_level;

/** The levels of daily movement to choose from, each with an icon and a meter. */
export function ActivityChoices({
  value,
  onChange,
}: {
  value: ActivityLevel | undefined;
  onChange: (level: ActivityLevel) => void;
}) {
  const { t } = useTranslation();
  return LEVELS.map((level, index) => (
    <ChoiceCard
      key={level}
      icon={ICONS[level]}
      title={t(`onboarding.options.activityLevel.${level}`)}
      description={t(`onboarding.activity.descriptions.${level}`)}
      level={{ value: index + 1, of: LEVELS.length }}
      selected={value === level}
      onPress={() => onChange(level)}
      size="compact"
    />
  ));
}
