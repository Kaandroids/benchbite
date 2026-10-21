import { useTranslation } from 'react-i18next';

import { ChoiceCard } from '@/components/ui/choice-card';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { Constants } from '@/lib/database.types';

import { useStep } from '../use-step';

/** Experience decides the volume, the split for three days and which exercises fit. */
export function ExperienceStep() {
  const { t } = useTranslation();
  const { answers, progress, back, choose } = useStep('experience');

  return (
    <Screen progress={progress} onBack={back}>
      <Text variant="title">{t('onboarding.steps.experience.title')}</Text>
      {Constants.public.Enums.experience.map((experience) => (
        <ChoiceCard
          key={experience}
          title={t(`onboarding.options.experience.${experience}`)}
          description={t(`onboarding.experience.descriptions.${experience}`)}
          selected={answers.experience === experience}
          onPress={() => choose({ experience })}
        />
      ))}
    </Screen>
  );
}
