import { useTranslation } from 'react-i18next';

import { ChoiceCard } from '@/components/ui/choice-card';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { Constants } from '@/lib/database.types';

import { useStep } from '../use-step';

/** Daily movement outside workouts; the training days are added to it in the calculation. */
export function ActivityStep() {
  const { t } = useTranslation();
  const { answers, progress, back, choose } = useStep('activity');

  return (
    <Screen progress={progress} onBack={back}>
      <Text variant="title">{t('onboarding.steps.activity.title')}</Text>
      {Constants.public.Enums.activity_level.map((activityLevel) => (
        <ChoiceCard
          key={activityLevel}
          title={t(`onboarding.options.activityLevel.${activityLevel}`)}
          description={t(`onboarding.activity.descriptions.${activityLevel}`)}
          selected={answers.activityLevel === activityLevel}
          onPress={() => choose({ activityLevel })}
        />
      ))}
    </Screen>
  );
}
