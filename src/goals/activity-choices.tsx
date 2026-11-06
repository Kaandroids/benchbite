import { useTranslation } from 'react-i18next';

import type { ActivityLevel } from '@/body/body';
import { ChoiceCard } from '@/components/ui/choice-card';
import type { IconName } from '@/components/ui/icon';
import { Constants } from '@/lib/database.types';
import type { Tone } from '@/theme';

/** One figure throughout, doing more through the day; none of them training. */
const ICONS: Record<ActivityLevel, IconName> = {
  sedentary: 'seated',
  light: 'standing',
  moderate: 'person',
  active: 'hiking',
};
/** From cool to warm as the day gets more active, in the colours of the meals and of water. */
export const ACTIVITY_TONES: Record<ActivityLevel, Tone> = {
  sedentary: 'dinner',
  light: 'water',
  moderate: 'breakfast',
  active: 'lunch',
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
      tone={ACTIVITY_TONES[level]}
      title={t(`goals.activityLevel.${level}`)}
      description={t(`goals.activityDescriptions.${level}`)}
      level={{ value: index + 1, of: LEVELS.length }}
      selected={value === level}
      onPress={() => onChange(level)}
      size="compact"
    />
  ));
}
